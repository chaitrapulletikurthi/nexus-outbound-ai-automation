'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const script=fs.readFileSync(path.join(__dirname,'../src/crm-sync.js'),'utf8');
function relay(fetchFn){
 const state={synced:false,attempts:0,lastError:null,commits:0};
 const query=async(sql,params=[])=>{
  const q=sql.replace(/\s+/g,' ');
  if(q==='BEGIN'||q==='ROLLBACK')return {rows:[]};
  if(q==='COMMIT'){state.commits++;return {rows:[]};}
  if(q.includes('SELECT a.id,a.action_key'))return {rows:state.synced?[]:[{id:1,action_key:'action-example',action_type:'suppression',action_data:{reason:'buyer_opt_out'},buyer_ref:'buyer-example'}]};
  if(q.includes('SET synced_at=now()')){state.synced=true;state.attempts++;return {rows:[]};}
  if(q.includes('SET sync_attempts=sync_attempts+1')){state.attempts++;state.lastError=params[1];return {rows:[]};}
  throw Error('Unexpected SQL in mock test');
 };
 const pool={connect:async()=>({query,release(){}})};
 const module={exports:{}};
 const load=n=>n==='pg'?{Pool:class{constructor(){return pool}}}:require(n);
 vm.runInNewContext(`(function(require,module,exports,process,fetch,AbortSignal){${script}\n})`,{console,setInterval})(load,module,module.exports,{env:{CRM_ACTION_WEBHOOK_URL:'https://example.invalid/actions',CRM_ACTION_API_TOKEN:'mock-secret'}},fetchFn,AbortSignal);
 return {syncOnce:module.exports.syncOnce,state};
}
test('CRM update only marks synced after durable matching acknowledgement',async()=>{
 const x=relay(async()=>({ok:true,json:async()=>({applied:true,actionKey:'action-example'})}));
 assert.equal((await x.syncOnce()).synced,true);
 assert.equal(x.state.synced,true);assert.equal(x.state.attempts,1);
 assert.equal((await x.syncOnce()).idle,true);
});
test('wrong acknowledgement keeps action queued for retry',async()=>{
 const x=relay(async()=>({ok:true,json:async()=>({applied:true,actionKey:'wrong-key'})}));
 assert.equal((await x.syncOnce()).error,'sync_failed_retry_scheduled');
 assert.equal(x.state.synced,false);assert.equal(x.state.attempts,1);
});
test('network failures retain outbox action',async()=>{
 const x=relay(async()=>{throw Error('offline');});
 assert.equal((await x.syncOnce()).error,'sync_failed_retry_scheduled');
 assert.equal(x.state.synced,false);
});
