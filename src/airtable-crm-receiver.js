'use strict';
// Optional private CRM receiver. Never expose on public Internet without authentication/TLS.
// All table/field mappings are private configuration; sample mappings are placeholders.
const http=require('node:http');
const crypto=require('node:crypto');
function authorized(value,secret){if(!value||!secret)return false;const a=Buffer.from(String(value)),b=Buffer.from('Bearer '+secret);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
function validateAction(x){
 if(!x||typeof x!=='object'||!['callback','interest','suppression','call_outcome'].includes(x.actionType)||typeof x.actionKey!=='string'||!/^[-\w:.]{5,180}$/.test(x.actionKey)||typeof x.buyerRef!=='string'||!/^rec[a-zA-Z0-9]{14}$/.test(x.buyerRef)||!x.data||typeof x.data!=='object'||Array.isArray(x.data))throw Error('invalid_action');
 if(JSON.stringify(x).length>12000)throw Error('action_too_large');return x;
}
function createReceiver(config,{fetchFn=fetch}={}){
 const {token,baseId,buyerTableId,actionTableId,bearerToken,doNotContactField='Do Not Contact',actionKeyField='Action Key',callbackRequestField='',interestSummaryField='',lastCallStatusField=''}=config;
 if(!token||!baseId||!buyerTableId||!actionTableId||!bearerToken)throw Error('missing_airtable_configuration');
 const base=`https://api.airtable.com/v0/${encodeURIComponent(baseId)}`;
 async function airtable(method,path,payload){
  const r=await fetchFn(base+'/'+path,{method,headers:{Authorization:'Bearer '+token,'content-type':'application/json'},...(payload!==undefined?{body:JSON.stringify(payload)}:{}),signal:AbortSignal.timeout(9000)});
  if(!r.ok)throw Error('airtable_write_failed_'+r.status);
  return r.json();
 }
 async function apply(action){
  validateAction(action);
  // Airtable buyer fields are optional and configured privately, never guessed.
  const fields={};
  if(action.actionType==='suppression')fields[doNotContactField]=true;
  if(action.actionType==='callback' && callbackRequestField)fields[callbackRequestField]=String(action.data.requestedTime||'Requested; scheduling pending').slice(0,80);
  if(action.actionType==='interest' && interestSummaryField)fields[interestSummaryField]=`${String(action.data.listingRef||'').slice(0,100)}: ${action.data.value===true?'interested':'not interested'}`;
  if(action.actionType==='call_outcome' && lastCallStatusField)fields[lastCallStatusField]=String(action.data.endedReason||action.data.status||'ended').slice(0,80);
  if(Object.keys(fields).length){
   await airtable('PATCH',`${encodeURIComponent(buyerTableId)}/${encodeURIComponent(action.buyerRef)}`,{fields});
   const actual=await airtable('GET',`${encodeURIComponent(buyerTableId)}/${encodeURIComponent(action.buyerRef)}`);
   for(const [name,value] of Object.entries(fields))if(actual.fields?.[name]!==value)throw Error('airtable_buyer_write_not_verified');
  }
  // Durable action ledger is the source of truth for all callback, interest and outcome actions.
  const payload={performUpsert:{fieldsToMergeOn:[actionKeyField]},records:[{fields:{[actionKeyField]:action.actionKey,
   'Action Type':action.actionType,'Buyer Ref':action.buyerRef,'Payload JSON':JSON.stringify(action.data).slice(0,10000)}}]};
  const result=await airtable('PATCH',encodeURIComponent(actionTableId),payload);
  const record=result.records?.[0];
  if(result.records?.length!==1||record?.fields?.[actionKeyField]!==action.actionKey||!record.id)throw Error('airtable_ack_missing');
  const verified=await airtable('GET',`${encodeURIComponent(actionTableId)}/${encodeURIComponent(record.id)}`);
  if(verified.fields?.[actionKeyField]!==action.actionKey || verified.fields?.['Action Type']!==action.actionType || verified.fields?.['Buyer Ref']!==action.buyerRef)throw Error('airtable_ledger_not_verified');
  return {applied:true,actionKey:action.actionKey};
 }

 const server=http.createServer(async(req,res)=>{
  function reply(code,data){res.writeHead(code,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));}
  if(req.method!=='POST'||req.url!=='/actions')return reply(404,{error:'not_found'});
  if(!authorized(req.headers.authorization,bearerToken))return reply(401,{error:'unauthorized'});
  try{let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>16000)throw Error('action_too_large');}
   return reply(200,await apply(JSON.parse(data)));
  }catch(e){const invalid=/^(invalid_action|action_too_large)$/.test(e.message);return reply(invalid?422:503,{error:invalid?e.message:'crm_unavailable'});}
 });
 return {apply,server};
}
if(require.main===module){
 const env=process.env;
 const {server}=createReceiver({token:env.AIRTABLE_TOKEN,baseId:env.AIRTABLE_BASE_ID,buyerTableId:env.AIRTABLE_BUYERS_TABLE_ID,actionTableId:env.AIRTABLE_ACTIONS_TABLE_ID,bearerToken:env.CRM_ACTION_API_TOKEN,doNotContactField:env.AIRTABLE_DNC_FIELD||'Do Not Contact',actionKeyField:env.AIRTABLE_ACTION_KEY_FIELD||'Action Key',callbackRequestField:env.AIRTABLE_CALLBACK_REQUEST_FIELD||'',interestSummaryField:env.AIRTABLE_INTEREST_SUMMARY_FIELD||'',lastCallStatusField:env.AIRTABLE_LAST_CALL_STATUS_FIELD||''});
 server.listen(Number(env.CRM_PORT||8090),'127.0.0.1',()=>console.log('Private Airtable receiver bound to loopback; use authenticated reverse proxy'));
}
module.exports={createReceiver,validateAction};
