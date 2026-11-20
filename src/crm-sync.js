'use strict';
// Outbox relay; sender retries at-least-once, receiver MUST apply actionKey idempotently.
const {Pool}=require('pg');
const env=process.env;
const pool=new Pool({connectionString:env.DATABASE_URL,ssl:env.PG_SSL==='true'?{rejectUnauthorized:true}:undefined,max:2});
async function syncOnce(){
 if(!env.CRM_ACTION_WEBHOOK_URL||!env.CRM_ACTION_API_TOKEN)return {disabled:true};
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const r=await db.query(`SELECT a.id,a.action_key,a.action_type,a.action_data,j.buyer_ref
    FROM outbound_call_actions a JOIN outbound_jobs j ON j.id=a.job_id
    WHERE a.synced_at IS NULL AND (a.next_sync_at IS NULL OR a.next_sync_at<=now())
    ORDER BY CASE WHEN a.action_type='suppression' THEN 0 ELSE 1 END, a.id
    LIMIT 1 FOR UPDATE OF a SKIP LOCKED`);
  if(!r.rows.length){await db.query('COMMIT');return {idle:true};}
  const action=r.rows[0];
  try{
   const response=await fetch(env.CRM_ACTION_WEBHOOK_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.CRM_ACTION_API_TOKEN}`},body:JSON.stringify({actionKey:action.action_key,actionType:action.action_type,buyerRef:action.buyer_ref,data:action.action_data}),signal:AbortSignal.timeout(7000)});
   if(!response.ok)throw Error(`HTTP_${response.status}`);
   // Success requires a durable application ACK containing same key.
   const ack=await response.json();
   if(ack.applied!==true||ack.actionKey!==action.action_key)throw Error('missing_durable_ack');
   await db.query('UPDATE outbound_call_actions SET synced_at=now(),sync_attempts=sync_attempts+1,last_sync_error=NULL,next_sync_at=NULL WHERE id=$1',[action.id]);
   await db.query('COMMIT');return {synced:true};
  }catch(e){
   await db.query(`UPDATE outbound_call_actions SET sync_attempts=sync_attempts+1,last_sync_error=$2,
     next_sync_at=now()+make_interval(secs=>LEAST(3600, POWER(2,LEAST(sync_attempts,10))::int * 15)) WHERE id=$1`,[action.id,String(e.message).slice(0,80)]);
   await db.query('COMMIT');return {error:'sync_failed_retry_scheduled'};
  }
 }catch(e){await db.query('ROLLBACK');return {error:'transaction_failed'};}finally{db.release();}
}
if(require.main===module){setInterval(()=>syncOnce().catch(e=>console.error('crm_sync_failed',e.name)),15000);console.log('CRM outbox relay started');}
module.exports={syncOnce};
