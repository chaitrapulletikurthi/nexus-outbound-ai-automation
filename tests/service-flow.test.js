'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const state={job:{id:'00000000-0000-4000-8000-000000000001',buyer_ref:'buyer-example',phone_e164:'+14155550100',status:'ended',call_id:'00000000-0000-4000-8000-000000000002',payload:{topDeals:[{dealId:'listing-example'}]}},flags:[],actions:new Map(),suppressed:false,events:new Set()};
const query=async (sql,params=[])=>{
 const normalized=sql.replace(/\s+/g,' ').trim();
 if(normalized.startsWith('SELECT pg_advisory_lock')||normalized.startsWith('SELECT pg_advisory_unlock')||normalized.startsWith('SELECT pg_advisory_xact_lock'))return {rows:[{}]};
 if(normalized==='BEGIN'||normalized==='COMMIT'||normalized==='ROLLBACK')return {rows:[],rowCount:0};
 if(normalized.includes('SELECT * FROM outbound_jobs WHERE id=$1 FOR UPDATE'))return {rows:[{...state.job}]};
 if(normalized.includes('SELECT * FROM outbound_jobs WHERE call_id=$1 LIMIT 1'))return {rows:[{...state.job}]};
 if(normalized.startsWith('UPDATE outbound_jobs SET')){state.job.status=params[1];return {rows:[{...state.job}],rowCount:1};}
 if(normalized.startsWith('INSERT INTO outbound_reconciliation_flags')){state.flags.push({kind:params[1]});return {rows:[]};}
 if(normalized.startsWith('INSERT INTO outbound_call_actions')){state.actions.set(params[1],{type:params[2],data:JSON.parse(params[3])});return {rows:[]};}
 if(normalized.startsWith('INSERT INTO outbound_suppression')){state.suppressed=true;return {rows:[]};}
 if(normalized.startsWith('INSERT INTO outbound_call_events')){state.events.add(params[3]);return {rows:[]};}
 if(normalized.startsWith('UPDATE outbound_reconciliation_flags SET')){state.flags=state.flags.filter(x=>x.kind!=='await_end_report');return {rows:[]};}
 if(normalized.startsWith('SELECT EXISTS(SELECT 1 FROM outbound_call_events'))return {rows:[{received:false}]};
 throw Error('Unsupported SQL in test: '+normalized.slice(0,100));
};
const fakePool={query,connect:async()=>({query,release(){}})};
const script=fs.readFileSync(path.join(__dirname,'../src/service.js'),'utf8');
const mod={exports:{}};
const loader=n=>n==='pg'?{Pool:class{constructor(){return fakePool}}}:require(n.startsWith('.')?path.join(__dirname,'../src',n):n);
vm.runInNewContext(`(function(require,module,exports,process,fetch,Buffer){${script}\n})`,{setInterval,console})(loader,mod,mod.exports,{env:{}},async()=>{throw Error('mock_network_disabled')},Buffer);
test('late active update cannot reopen finalized call',async()=>{
 const outcome=await mod.exports.transition(state.job.id,'active');
 assert.equal(outcome.applied,false);assert.equal(state.job.status,'ended');
 assert.ok(state.flags.some(x=>x.kind==='unexpected_transition'));
});
test('opt-out tool is linked to authenticated call, not model-supplied buyer identity',async()=>{
 const callId=state.job.call_id;
 const payload={message:{type:'tool-calls',call:{id:callId},toolCallList:[{id:'tool-01',function:{name:'do_not_call',arguments:{buyer_ref:'wrong-model-ref'}}}]}};
 const response=await mod.exports.handleWebhook(payload);
 assert.equal(JSON.parse(response.results[0].result).ok,true);
 assert.equal(state.suppressed,true);
 assert.equal(state.actions.get(`${callId}:tool-01`).data.buyerRef,'buyer-example');
 await mod.exports.handleWebhook(payload);
 assert.equal(state.actions.size,1);
});
test('end report can detect explicit verbal opt-out without a tool call',async()=>{
 const result=await mod.exports.handleWebhook({message:{type:'end-of-call-report',call:{id:state.job.call_id},artifact:{transcript:'Buyer: Please do not call me again.'}}});
 assert.equal(result.ok,true);
 assert.equal(state.actions.get(`transcript-optout:${state.job.call_id}`).type,'suppression');
 assert.equal(state.actions.get(`outcome:${state.job.call_id}`).type,'call_outcome');
});
