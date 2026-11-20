'use strict';
// Private queue coordinator. No outbound calls unless all launch switches and services exist.
const http=require('node:http');
const crypto=require('node:crypto');
const {Pool}=require('pg');
const {VapiClient}=require('./vapi');
const {buildQueuePayload}=require('./queue-payload');
const {validateJob}=require('./contracts');
const {phone,consentAndEligibility,quality,statusFromVapi,safeToolAction,mayTransition}=require('./core');
const env=process.env;
const pool=new Pool({connectionString:env.DATABASE_URL,ssl:env.PG_SSL==='true'?{rejectUnauthorized:true}:undefined,max:4});
const enabled=()=>{
 const required=['DATABASE_URL','ELIGIBILITY_URL','VAPI_PRIVATE_KEY','VAPI_ASSISTANT_ID','VAPI_PHONE_NUMBER_ID','WEBHOOK_BEARER_TOKEN','CRM_ACTION_WEBHOOK_URL','CRM_ACTION_API_TOKEN','ELIGIBILITY_TOKEN','LISTING_REVIEW_URL','LISTING_REVIEW_TOKEN','INTERNAL_API_TOKEN','REVIEW_ADMIN_TOKEN'];
 return env.ENABLE_LIVE_CALLS==='true' && env.LAUNCH_APPROVED==='true' && env.PG_SSL==='true'
  && required.every(k=>typeof env[k]==='string'&&env[k].trim()&&!/REPLACE_WITH|YOUR_PRIVATE|EXAMPLE/i.test(env[k]))
  && ['ELIGIBILITY_URL','CRM_ACTION_WEBHOOK_URL','LISTING_REVIEW_URL'].every(k=>env[k].startsWith('https://'));
};
const vapi=new VapiClient({apiKey:env.VAPI_PRIVATE_KEY,assistantId:env.VAPI_ASSISTANT_ID,phoneNumberId:env.VAPI_PHONE_NUMBER_ID});
function auth(header,secret){if(!secret||!header)return false;const a=Buffer.from(header),b=Buffer.from(`Bearer ${secret}`);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function send(res,status,payload){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(payload));}
async function body(req){let b='';for await(const chunk of req){b+=chunk;if(Buffer.byteLength(b)>65536)throw Error('payload_too_large');}try{return JSON.parse(b||'{}');}catch{throw Error('invalid_json');}}
function eventKey(msg,callId){
 // Do not assume a provider-supplied message ID is unique per delivery type.
 // A stable fingerprint preserves distinct end/status content while suppressing retries.
 const details={type:msg.type,callId,providerEventId:msg.id||null,status:msg.status||null,
   endedReason:msg.endedReason||null,transcript:msg.artifact?.transcript||msg.transcript||null,
   toolCallList:msg.toolCallList||null};
 return `sha256:${crypto.createHash('sha256').update(JSON.stringify(details)).digest('hex')}`;
}
const publicJob=j=>({id:j.id,status:j.status,callId:j.call_id||null,blockedReasons:j.blocked_reasons||[]});
function stableError(e){const code=String(e?.message||'internal_error');return code.startsWith('property_quality:')?'property_quality':/^[a-z][a-z0-9_]{2,90}$/.test(code)?code:'internal_error';}
async function enqueue(input){
 validateJob(input);
 const errors=quality(input.topDeals);if(errors.length)throw Error(`property_quality:${errors.join(',')}`);
 // Use a fresh snapshot of private approval during dispatch as well.
 const r=await pool.query(`INSERT INTO outbound_jobs(id,buyer_ref,phone_e164,payload,idempotency_key)
 VALUES($1,$2,$3,$4,$5) ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
 RETURNING id,status,call_id,blocked_reasons`,[crypto.randomUUID(),String(input.buyerId),phone(input.phone),JSON.stringify(input),String(input.idempotencyKey)]);
 return publicJob(r.rows[0]);
}
async function prepareAndEnqueue(raw){
 validatePrepared(raw);
 const response=await fetch(env.LISTING_REVIEW_URL,{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${env.LISTING_REVIEW_TOKEN}`},body:JSON.stringify({listingRefs:raw.topDeals.map(d=>d.dealId)}),signal:AbortSignal.timeout(6000)});
 if(!response.ok)throw Error('listing_review_unavailable');
 const reviewed=await response.json();
 if(!Array.isArray(reviewed.listings))throw Error('invalid_listing_review_response');
 return enqueue(buildQueuePayload(raw,reviewed.listings));
}
function validatePrepared(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||!raw.buyerId||!phone(raw.phone)||!Array.isArray(raw.topDeals)||raw.topDeals.length<1||raw.topDeals.length>3)throw Error('invalid_prepared');
 if(JSON.stringify(raw).length>24000)throw Error('prepared_payload_too_large');
}
async function approvedSnapshot(job){
 const response=await fetch(env.ELIGIBILITY_URL,{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${env.ELIGIBILITY_TOKEN}`},body:JSON.stringify({buyerRef:job.buyer_ref,phone:job.phone_e164}),signal:AbortSignal.timeout(6000)});
 if(!response.ok)throw Error('eligibility_service_unavailable');
 const data=await response.json();
 if(data.buyerId!==job.buyer_ref||phone(data.phone)!==job.phone_e164)throw Error('eligibility_identity_mismatch');
 return data;
}
async function currentListings(job){
 const response=await fetch(env.LISTING_REVIEW_URL,{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${env.LISTING_REVIEW_TOKEN}`},body:JSON.stringify({listingRefs:job.payload.topDeals.map(x=>x.dealId)}),signal:AbortSignal.timeout(6000)});
 if(!response.ok)throw Error('listing_review_unavailable');
 const data=await response.json();
 if(!data||!Array.isArray(data.listings))throw Error('invalid_listing_review_response');
 // Ensures the approved copy, price, region and freshness are identical at dispatch.
 const approved=buildQueuePayload(job.payload,data.listings);
 if(approved.propertyBriefing!==job.payload.propertyBriefing)throw Error('spoken_briefing_not_approved');
 return approved.topDeals;
}
async function historyFor(job){
 const r=await pool.query(`SELECT
   EXISTS(SELECT 1 FROM outbound_suppression WHERE phone_e164=$1) AS suppressed,
   (SELECT count(*)::int FROM outbound_jobs WHERE phone_e164=$1 AND dial_attempted_at>=now()-interval '30 days') AS attempts,
   (SELECT max(dial_attempted_at) FROM outbound_jobs WHERE phone_e164=$1) AS last_attempt,
   EXISTS(SELECT 1 FROM outbound_jobs WHERE phone_e164=$1 AND id<>$2 AND status IN ('dialing','active','unknown')) AS in_flight,
   EXISTS(SELECT 1 FROM outbound_call_actions a JOIN outbound_jobs j ON j.id=a.job_id WHERE j.phone_e164=$1 AND a.action_type='suppression' AND a.synced_at IS NULL) AS pending_suppression,
   EXISTS(SELECT 1 FROM outbound_reconciliation_flags f JOIN outbound_jobs j ON j.id=f.job_id WHERE j.phone_e164=$1 AND f.reviewed_at IS NULL AND f.kind IN ('review_call_artifact_and_opt_out','missing_transcript','missing_verified_end_report')) AS pending_artifact_review`,[job.phone_e164,job.id]);
 const x=r.rows[0];return {suppressed:x.suppressed||x.pending_suppression||x.pending_artifact_review,active:x.in_flight,unknownCall:x.in_flight,attemptsIn30Days:x.attempts,lastAttemptAt:x.last_attempt};
}
async function transition(jobId,to,extra={}){
 const db=await pool.connect();
 try{await db.query('BEGIN');
  const r=await db.query('SELECT * FROM outbound_jobs WHERE id=$1 FOR UPDATE',[jobId]);if(!r.rows.length)throw Error('job_not_found');
  const old=r.rows[0];
  if(!mayTransition(old.status,to)){
   await db.query(`INSERT INTO outbound_reconciliation_flags(job_id,kind,details) VALUES($1,$2,$3)`,[jobId,'unexpected_transition',JSON.stringify({from:old.status,to})]);
   await db.query('COMMIT');return {applied:false,from:old.status,to};
  }
  const upd=await db.query(`UPDATE outbound_jobs SET status=$2,blocked_reasons=COALESCE($3::jsonb,blocked_reasons),
    call_id=COALESCE($4,call_id),last_error=COALESCE($5,last_error),updated_at=now(),state_version=state_version+1,
    dial_attempted_at=CASE WHEN $2='dialing' AND dial_attempted_at IS NULL THEN now() ELSE dial_attempted_at END,
    ended_at=CASE WHEN $2='ended' THEN COALESCE(ended_at,now()) ELSE ended_at END,
    completed_at=CASE WHEN $2='ended' THEN COALESCE(completed_at,now()) ELSE completed_at END
    WHERE id=$1 RETURNING *`,[jobId,to,extra.reasons?JSON.stringify(extra.reasons):null,extra.callId||null,extra.error||null]);
  await db.query('COMMIT');return {applied:true,job:upd.rows[0]};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
async function recordEvent(jobId,callId,type,key,data){
 await pool.query('INSERT INTO outbound_call_events(job_id,call_id,event_type,event_key,event_data) VALUES($1,$2,$3,$4,$5) ON CONFLICT(event_key) DO NOTHING',[jobId,callId,type,key,JSON.stringify(data)]);
}
async function flag(jobId,kind,details={}){
 await pool.query('INSERT INTO outbound_reconciliation_flags(job_id,kind,details) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[jobId,kind,JSON.stringify(details)]);
}
async function withCallLock(callId,action){
 const client=await pool.connect();
 let locked=false;
 try{
  await client.query('SELECT pg_advisory_lock(hashtext($1))',[`outbound-call:${callId}`]);locked=true;
  return await action();
 }finally{
  try{if(locked)await client.query('SELECT pg_advisory_unlock(hashtext($1))',[`outbound-call:${callId}`]);}finally{client.release();}
 }
}
async function replayLinkedUnmatched(){
 // Periodic reconciliation closes the bind-versus-stage race if a webhook arrives
 // precisely as the outbound call ID is committed.
 const r=await pool.query(`SELECT DISTINCT e.call_id FROM outbound_unmatched_events e
  JOIN outbound_jobs j ON j.call_id=e.call_id WHERE e.consumed_at IS NULL ORDER BY e.call_id LIMIT 20`);
 for(const row of r.rows)await replayUnmatched(row.call_id);
}
async function pollExisting(job){
 if(!job.call_id){await transition(job.id,'unknown',{error:'call_id_missing_manual_reconciliation'});return;}
 let call;try{call=await vapi.get(job.call_id)}catch(e){await transition(job.id,'unknown',{error:'status_unavailable_manual_reconciliation'});return;}
 const state=statusFromVapi(call);
 await withCallLock(job.call_id,async()=>{
  if(state==='ended'){
   const found=await pool.query("SELECT EXISTS(SELECT 1 FROM outbound_call_events WHERE job_id=$1 AND event_type='end-of-call-report') AS received",[job.id]);
   if(!found.rows[0].received)await flag(job.id,'await_end_report');
   await transition(job.id,'ended');
   await recordEvent(job.id,job.call_id,'call-ended',`poll:${job.call_id}`,{endedReason:String(call.endedReason||'').slice(0,80)});
  }else if(state==='unknown')await transition(job.id,'unknown',{error:'unexpected_vapi_status_manual_reconciliation'});
 });
}
async function dispatch(job){
 let buyer;
 try{buyer=await approvedSnapshot(job)}catch{await transition(job.id,'blocked',{reasons:['eligibility_service_unavailable']});return;}
 const history=await historyFor(job);
 const reasons=consentAndEligibility(buyer,history,{maxAttemptsIn30Days:2}).reasons;
 let listingErrors=[];
 try{await currentListings(job)}catch{listingErrors=['listing_review_failed_or_changed'];}
 if(reasons.length||listingErrors.length){await transition(job.id,'blocked',{reasons:[...reasons,...listingErrors]});return;}
 // Persist dial intent before remote POST. Uncertain outcome must be reconciled; never auto-retry.
 // Serialize local suppression updates with dispatch intent for this contact.
 const gate=await pool.connect();
 try{
  await gate.query('BEGIN');
  await gate.query('SELECT pg_advisory_xact_lock(hashtext($1))',[job.phone_e164]);
  const block=await gate.query(`SELECT EXISTS(SELECT 1 FROM outbound_suppression WHERE phone_e164=$1) OR EXISTS(SELECT 1 FROM outbound_call_actions a JOIN outbound_jobs j ON j.id=a.job_id WHERE j.phone_e164=$1 AND a.action_type='suppression' AND a.synced_at IS NULL) AS suppressed`,[job.phone_e164]);
  if(block.rows[0].suppressed){await gate.query('ROLLBACK');await transition(job.id,'blocked',{reasons:['suppressed_before_dispatch']});return;}
  const claim=await gate.query(`UPDATE outbound_jobs SET status='dialing',updated_at=now(),state_version=state_version+1
   WHERE id=$1 AND status='queued' RETURNING id`,[job.id]);
  if(claim.rowCount!==1){await gate.query('ROLLBACK');return;}
  await gate.query('COMMIT');
 }catch(e){await gate.query('ROLLBACK');throw e;}finally{gate.release();}
 try{
  // A second service-side check minimizes the revocation-to-dial interval.
  // A remote API request cannot be made atomically with the database transaction.
  const current=await approvedSnapshot(job);
  const latest=await historyFor(job);
  // Ignore our own dialing state while preserving all local suppressions and contact limits.
  const localHold=await pool.query(`SELECT EXISTS(SELECT 1 FROM outbound_suppression WHERE phone_e164=$1)
   OR EXISTS(SELECT 1 FROM outbound_call_actions a JOIN outbound_jobs j ON j.id=a.job_id
   WHERE j.phone_e164=$1 AND a.action_type='suppression' AND a.synced_at IS NULL) AS suppressed`,[job.phone_e164]);
  const candidate=consentAndEligibility(current,{...latest,active:false,unknownCall:false,
   attemptsIn30Days:latest.attemptsIn30Days,lastAttemptAt:latest.lastAttemptAt},{maxAttemptsIn30Days:2});
  if(localHold.rows[0].suppressed || !candidate.eligible){await transition(job.id,'blocked',{reasons:['dial_preflight_not_cleared']});return;}
  // Record the attempt only when an outbound request is about to be issued.
  await pool.query("UPDATE outbound_jobs SET dial_attempted_at=now() WHERE id=$1 AND status='dialing' AND dial_attempted_at IS NULL",[job.id]);
  const created=await vapi.create(job.payload);
  if(!created.id)throw Error('create_without_id');
  await transition(job.id,'active',{callId:created.id});
  await replayUnmatched(created.id);
  await recordEvent(job.id,created.id,'call-created',`created:${created.id}`,{});
 }catch(e){await transition(job.id,'unknown',{error:'call_creation_uncertain_manual_reconciliation'});}
}
async function tick(){
 if(!enabled())return;
 const db=await pool.connect();
 try{const got=await db.query('SELECT pg_try_advisory_lock(718217,301) locked');if(!got.rows[0].locked)return;
  try{
   await replayLinkedUnmatched();
   const pending=await db.query("SELECT * FROM outbound_jobs WHERE status IN ('unknown','dialing') LIMIT 1");if(pending.rows.length)return;
   const review=await db.query("SELECT EXISTS(SELECT 1 FROM outbound_reconciliation_flags WHERE reviewed_at IS NULL AND kind IN ('await_end_report','missing_transcript','missing_verified_end_report')) AS pending");
   if(review.rows[0].pending)return;
   const active=await db.query("SELECT * FROM outbound_jobs WHERE status='active' ORDER BY created_at LIMIT 1");
   if(active.rows.length){await pollExisting(active.rows[0]);return;}
   // Any urgent suppression action awaiting propagation pauses next dispatch.
   const sync=await db.query("SELECT EXISTS(SELECT 1 FROM outbound_call_actions WHERE action_type='suppression' AND synced_at IS NULL) AS pending");
   if(sync.rows[0].pending)return;
   const next=await db.query("SELECT * FROM outbound_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1");
   if(next.rows.length)await dispatch(next.rows[0]);
  }finally{await db.query('SELECT pg_advisory_unlock(718217,301)');}
 }finally{db.release();}
}
function optOutFromTranscript(text){
 if(typeof text!=='string')return false;
 // Conservative signal only; ambiguous cases go to manual review.
 return /\b(do not call (me|us)( again)?|don't call (me|us)( again)?|remove (me|us) from (your )?(call|contact) list|stop calling (me|us))\b/i.test(text);
}
async function persistAction(job,callId,actionKey,action){
 const db=await pool.connect();
 try{await db.query('BEGIN');
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[job.phone_e164]);
  await db.query('INSERT INTO outbound_call_actions(job_id,action_key,action_type,action_data) VALUES($1,$2,$3,$4) ON CONFLICT(action_key) DO NOTHING',[job.id,actionKey,action.type,JSON.stringify(action)]);
  if(action.type==='suppression')await db.query(`INSERT INTO outbound_suppression(phone_e164,reason) VALUES($1,$2) ON CONFLICT(phone_e164) DO UPDATE SET reason=EXCLUDED.reason,updated_at=now()`,[job.phone_e164,'buyer_opt_out']);
  await db.query('COMMIT');
 }catch(e){await db.query('ROLLBACK');throw e}finally{db.release();}
}
async function stageUnmatched(callId,msg){
 // No tool execution without a trusted call-to-job binding. Store end/status evidence for later replay.
 if(!['end-of-call-report','status-update'].includes(msg.type))return {results:(msg.toolCallList||[]).map(t=>({toolCallId:t.id,result:JSON.stringify({ok:false,error:'call_not_bound'})}))};
 const key=eventKey(msg,callId);
 const artifact=msg.artifact?.transcript||msg.transcript||'';
 const stored={message:{type:msg.type,call:{id:callId},id:msg.id,status:msg.status,endedReason:msg.endedReason,artifact:{transcript:String(artifact).slice(0,30000)}}};
 await pool.query(`INSERT INTO outbound_unmatched_events(call_id,event_key,payload) VALUES($1,$2,$3) ON CONFLICT(event_key) DO NOTHING`,[callId,key,JSON.stringify(stored)]);
 return {accepted:true,heldForCorrelation:true};
}
async function replayUnmatched(callId){
 const records=await pool.query('SELECT id,payload FROM outbound_unmatched_events WHERE call_id=$1 AND consumed_at IS NULL ORDER BY id',[callId]);
 for(const record of records.rows){await handleWebhook(record.payload);await pool.query('UPDATE outbound_unmatched_events SET consumed_at=now() WHERE id=$1',[record.id]);}
}
async function handleWebhook(payload){
 if(!payload || typeof payload!=='object' || Array.isArray(payload) || !payload.message || typeof payload.message!=='object' || Array.isArray(payload.message))throw Error('invalid_webhook_payload');
 const msg=payload.message;
 if(msg.toolCallList && (!Array.isArray(msg.toolCallList) || msg.toolCallList.length>12))throw Error('invalid_webhook_tools');const callId=msg.call?.id;
 if(!callId)return {results:(msg.toolCallList||[]).map(t=>({toolCallId:t.id,result:JSON.stringify({ok:false,error:'missing_authenticated_call_id'})}))};
 const r=await pool.query('SELECT * FROM outbound_jobs WHERE call_id=$1 LIMIT 1',[callId]);
 if(!r.rows.length)return stageUnmatched(callId,msg);
 const job=r.rows[0];
 return withCallLock(callId,async()=>{
 if(msg.type==='status-update'||msg.type==='end-of-call-report'){
  const key=eventKey(msg,callId);
  await recordEvent(job.id,callId,msg.type,key,{status:msg.status||null,endedReason:msg.endedReason||null});
  if(msg.type==='status-update' && msg.status==='ended'){
   await flag(job.id,'await_end_report');
   await transition(job.id,'ended');
   const already=await pool.query("SELECT EXISTS(SELECT 1 FROM outbound_call_events WHERE job_id=$1 AND event_type='end-of-call-report') AS received",[job.id]);
   if(already.rows[0].received)await pool.query("UPDATE outbound_reconciliation_flags SET reviewed_at=now() WHERE job_id=$1 AND kind='await_end_report' AND reviewed_at IS NULL",[job.id]);
  }
  if(msg.type==='end-of-call-report'){
   await flag(job.id,'await_end_report');
   const transcript=msg.artifact?.transcript||msg.transcript||'';
   if(optOutFromTranscript(transcript))await persistAction(job,callId,`transcript-optout:${callId}`,{type:'suppression',buyerRef:job.buyer_ref,reason:'transcript_opt_out'});
   await pool.query("UPDATE outbound_reconciliation_flags SET reviewed_at=now() WHERE job_id=$1 AND kind='await_end_report' AND reviewed_at IS NULL",[job.id]);
   await persistAction(job,callId,`outcome:${callId}`,{type:'call_outcome',buyerRef:job.buyer_ref,callId,endedReason:String(msg.endedReason||'unknown').slice(0,80),status:'ended'});
   if(!transcript)await flag(job.id,'missing_transcript');
   else await flag(job.id,'review_call_artifact_and_opt_out',{hasTranscript:true});
   await transition(job.id,'ended');
  }
 }
 if(msg.type==='tool-calls'){
  const results=[];
  for(const tool of msg.toolCallList||[]){
   let result={ok:false,error:'action_rejected'};
   try{
    if(!tool.id)throw Error('missing_tool_id');
    const args=typeof tool.function?.arguments==='string'?JSON.parse(tool.function.arguments):(tool.function?.arguments||{});
    const action=safeToolAction(tool.function?.name,args);
    // Trust the call-to-job mapping, not model-supplied buyer references.
    action.buyerRef=job.buyer_ref;
    if(action.type==='interest'&&!job.payload.topDeals.some(d=>d.dealId===action.listingRef))throw Error('unmatched_listing');
    await persistAction(job,callId,`${callId}:${tool.id}`,action);
    result={ok:true,recorded:true,crmSync:'pending'};
   }catch{result={ok:false,error:'action_rejected'};}
   results.push({name:tool.function?.name||'unknown',toolCallId:tool.id,result:JSON.stringify(result)});
  }
  return {results};
 }
 return {ok:true};
 });
}
async function reconcileJob(input){
 const {jobId,resolution,providerCallId,evidenceRef,reviewNote}=input||{};
 if(!/^[0-9a-f-]{36}$/i.test(String(jobId||''))||!['provider_ended','no_call_confirmed'].includes(resolution)||typeof evidenceRef!=='string'||evidenceRef.trim().length<10||typeof reviewNote!=='string'||reviewNote.trim().length<16)throw Error('invalid_recovery_request');
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const r=await db.query('SELECT * FROM outbound_jobs WHERE id=$1 FOR UPDATE',[jobId]);
  if(!r.rows.length)throw Error('job_not_found');
  const job=r.rows[0];
  if(!['unknown','dialing'].includes(job.status))throw Error('job_not_recoverable');
  if(resolution==='provider_ended'){
   if(!providerCallId||!vapi.get)throw Error('provider_call_id_required');
   const remote=await vapi.get(providerCallId);
   const remoteTime=Date.parse(remote.createdAt), localTime=Date.parse(job.dial_attempted_at);
   if(remote.id!==providerCallId||statusFromVapi(remote)!=='ended'||phone(remote.customer?.number)!==job.phone_e164||remote.assistantId!==env.VAPI_ASSISTANT_ID||!Number.isFinite(remoteTime)||!Number.isFinite(localTime)||Math.abs(remoteTime-localTime)>5*60000)throw Error('provider_call_identity_or_status_mismatch');
   if(job.call_id&&job.call_id!==providerCallId)throw Error('provider_call_mismatch');
   await db.query(`UPDATE outbound_jobs SET status='ended',call_id=$2,ended_at=now(),completed_at=now(),last_reconciled_at=now(),updated_at=now(),state_version=state_version+1 WHERE id=$1`,[jobId,providerCallId]);
   await db.query(`INSERT INTO outbound_reconciliation_flags(job_id,kind,details) VALUES($1,'missing_verified_end_report',$2)`,[jobId,JSON.stringify({evidenceRef})]);
  }else{
   // Operator attests provider records and carrier records show NO call; no auto-redial.
   if(providerCallId)throw Error('no_call_resolution_must_not_include_call_id');
   await db.query(`UPDATE outbound_jobs SET status='blocked',blocked_reasons='["operator_confirmed_no_call_no_retry"]'::jsonb,last_reconciled_at=now(),updated_at=now(),state_version=state_version+1 WHERE id=$1`,[jobId]);
  }
  await db.query('INSERT INTO outbound_operator_audit(job_id,action,evidence_ref,note,result) VALUES($1,$2,$3,$4,$5)',[jobId,resolution,evidenceRef,reviewNote,JSON.stringify({previousStatus:job.status,providerCallId:providerCallId||null})]);
  await db.query('COMMIT');
  let replayWarning=false;
  if(resolution==='provider_ended'){try{await replayUnmatched(providerCallId);}catch{replayWarning=true;}}
  return {resolved:true,status:resolution==='provider_ended'?'ended':'blocked',nextAction:resolution==='provider_ended'?'review_missing_call_artifact':'no_retry',replayWarning};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
const server=http.createServer(async(req,res)=>{
 try{
  // Liveness only: a running HTTP process is not proof of database readiness.
  if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,liveCallsEnabled:Boolean(enabled())});
  // Database-backed readiness, suitable for internal deployment probes.
  // Never return connection strings or underlying database error messages.
  if(req.method==='GET'&&req.url==='/ready'){
   try{
    await pool.query({text:'SELECT 1 AS ready',query_timeout:2500});
    return send(res,200,{ready:true});
   }catch{
    return send(res,503,{ready:false,error:'database_unavailable'});
   }
  }
  if(req.method==='POST'&&req.url==='/vapi/webhook'){
   if(!auth(req.headers.authorization,env.WEBHOOK_BEARER_TOKEN))return send(res,401,{error:'unauthorized'});
   return send(res,200,await handleWebhook(await body(req)));
  }
  if(req.method==='POST'&&req.url==='/reviews/reconcile'){
   if(!auth(req.headers.authorization,env.REVIEW_ADMIN_TOKEN))return send(res,401,{error:'unauthorized'});
   return send(res,200,await reconcileJob(await body(req)));
  }
  if(req.method==='POST'&&req.url==='/reviews/resolve'){
   if(!auth(req.headers.authorization,env.REVIEW_ADMIN_TOKEN))return send(res,401,{error:'unauthorized'});
   const input=await body(req), flagId=Number(input.flagId), note=String(input.reviewNote||'').trim();
   if(!Number.isSafeInteger(flagId)||flagId<=0||note.length<12)throw Error('valid_flag_and_review_note_required');
   const db=await pool.connect();
   try{
    await db.query('BEGIN');
    const selected=await db.query('SELECT f.*,j.buyer_ref,j.call_id FROM outbound_reconciliation_flags f JOIN outbound_jobs j ON j.id=f.job_id WHERE f.id=$1 AND f.reviewed_at IS NULL FOR UPDATE OF f',[flagId]);
    if(!selected.rows.length){await db.query('ROLLBACK');return send(res,200,{resolved:false});}
    const f=selected.rows[0];
    if(['missing_verified_end_report','await_end_report'].includes(f.kind) && f.call_id){
     await db.query(`INSERT INTO outbound_call_actions(job_id,action_key,action_type,action_data) VALUES($1,$2,'call_outcome',$3) ON CONFLICT(action_key) DO NOTHING`,[f.job_id,`outcome:${f.call_id}`,JSON.stringify({type:'call_outcome',buyerRef:f.buyer_ref,callId:f.call_id,status:'ended',outcomeSource:'manual_review',detailsVerified:false})]);
    }
    await db.query('UPDATE outbound_reconciliation_flags SET reviewed_at=now() WHERE id=$1',[flagId]);
    await db.query('INSERT INTO outbound_operator_audit(job_id,action,evidence_ref,note) VALUES($1,$2,$3,$4)',[f.job_id,'resolve_review_flag',`review_flag:${flagId}`,note]);
    await db.query('COMMIT');
    return send(res,200,{resolved:true});
   }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
  }
  if(!auth(req.headers.authorization,env.INTERNAL_API_TOKEN))return send(res,401,{error:'unauthorized'});
  if(req.method==='POST'&&req.url==='/jobs')return send(res,202,await enqueue(await body(req)));
  if(req.method==='POST'&&req.url==='/prepare-and-enqueue')return send(res,202,await prepareAndEnqueue(await body(req)));
  if(req.method==='GET'&&req.url==='/queue/alerts'){
   const r=await pool.query(`SELECT (SELECT count(*)::int FROM outbound_jobs WHERE status='unknown' OR (status='dialing' AND updated_at<now()-interval '2 minutes') OR (status='active' AND updated_at<now()-interval '15 minutes')) AS stuck_calls,
   (SELECT count(*)::int FROM outbound_call_actions WHERE synced_at IS NULL AND created_at<now()-interval '10 minutes') AS delayed_crm,
   (SELECT count(*)::int FROM outbound_reconciliation_flags WHERE reviewed_at IS NULL AND created_at<now()-interval '10 minutes') AS overdue_reviews,
   (SELECT count(*)::int FROM outbound_unmatched_events WHERE consumed_at IS NULL AND received_at<now()-interval '2 minutes') AS unmatched_events`);
   const metrics=r.rows[0];return send(res,Object.values(metrics).some(Number)?503:200,{healthy:!Object.values(metrics).some(Number),metrics});
  }
  if(req.method==='GET'&&req.url==='/queue/status'){
   const r=await pool.query('SELECT status,count(*)::int AS count FROM outbound_jobs GROUP BY status');return send(res,200,{counts:r.rows,liveCallsEnabled:Boolean(enabled())});
  }
  return send(res,404,{error:'not_found'});
 }catch(e){const name=stableError(e);const code=name==='payload_too_large'?413:/^(invalid_|unexpected_|property_quality|listing_content|verified_region|prepared_payload|missing_|valid_flag|no_call_resolution)/.test(name)?422:/^(job_not_found)$/.test(name)?404:/^(job_not_recoverable|provider_call_mismatch)/.test(name)?409:503;return send(res,code,{error:name});}
});
if(require.main===module){
 const port=Number(env.PORT||8080);server.listen(port,env.LISTEN_HOST||'127.0.0.1',()=>console.log(`Queue coordinator listening privately on ${port}; live calls ${enabled()?'ENABLED':'DISABLED'}`));
 setInterval(()=>tick().catch(e=>console.error('queue_tick_failed',e.name)),Number(env.POLL_INTERVAL_MS||15000)).unref();
}
module.exports={enqueue,prepareAndEnqueue,handleWebhook,replayUnmatched,reconcileJob,tick,server,enabled,transition,optOutFromTranscript,replayLinkedUnmatched,withCallLock};
