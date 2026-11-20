'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const job={id:'00000000-0000-4000-8000-000000000001',buyer_ref:'buyer-fixture',phone_e164:'+14155550100',status:'active',call_id:'00000000-0000-4000-8000-000000000002',payload:{topDeals:[{dealId:'listing-fixture'}]}};
const stored=[],flags=[],events=new Set(),actions=new Set();
async function query(sql,params=[]){
 const s=sql.replace(/\s+/g,' ').trim();
 if(['BEGIN','COMMIT','ROLLBACK'].includes(s)||s.startsWith('SELECT pg_advisory_xact_lock')||s.startsWith('SELECT pg_advisory_lock')||s.startsWith('SELECT pg_advisory_unlock'))return {rows:[]};
 if(s.startsWith('SELECT * FROM outbound_jobs WHERE call_id'))return {rows:job.call_id===params[0]?[{...job}]:[]};
 if(s.startsWith('SELECT * FROM outbound_jobs WHERE id=$1 FOR UPDATE'))return {rows:[{...job}]};
 if(s.startsWith('UPDATE outbound_jobs SET status=')){job.status=params[1];job.call_id=params[3]||job.call_id;return {rows:[{...job}]};}
 if(s.startsWith('INSERT INTO outbound_unmatched_events')){stored.push({id:stored.length+1,call_id:params[0],payload:JSON.parse(params[2]),consumed:false});return {rows:[]};}
 if(s.startsWith('SELECT id,payload FROM outbound_unmatched_events'))return {rows:stored.filter(x=>x.call_id===params[0]&&!x.consumed)};
 if(s.startsWith('UPDATE outbound_unmatched_events SET')){stored.find(x=>x.id===params[0]).consumed=true;return {rows:[]};}
 if(s.startsWith('INSERT INTO outbound_call_events')){events.add(params[3]);return {rows:[]};}
 if(s.startsWith('INSERT INTO outbound_call_actions')){actions.add(params[1]);return {rows:[]};}
 if(s.startsWith('INSERT INTO outbound_reconciliation_flags')){flags.push({kind:params[1]});return {rows:[]};}
 if(s.startsWith('UPDATE outbound_reconciliation_flags'))return {rows:[]};
 if(s.startsWith('SELECT EXISTS(SELECT 1 FROM outbound_call_events'))return {rows:[{received:false}]};
 if(s.startsWith('INSERT INTO outbound_suppression'))return {rows:[]};
 throw Error('Unexpected mock SQL '+s.slice(0,115));
}
const fakePool={query,connect:async()=>({query,release(){}})};
const source=fs.readFileSync(path.join(__dirname,'../../src/service.js'),'utf8'),mod={exports:{}};
const loader=n=>n==='pg'?{Pool:class{constructor(){return fakePool;}}}:require(n.startsWith('.')?path.join(__dirname,'../../src',n):n);
vm.runInNewContext('(function(require,module,exports,process,fetch,Buffer){'+source+'\n})',{setInterval,console})(loader,mod,mod.exports,{env:{}},async()=>{throw Error('no_external_network');},Buffer);
test('early end report is stored then replayed after call ID binds',async()=>{
 const actual=job.call_id;job.call_id=null;job.status='dialing';
 const r=await mod.exports.handleWebhook({message:{id:'event-fixture',type:'end-of-call-report',call:{id:actual},artifact:{transcript:'fictional conversation'}}});
 assert.equal(r.heldForCorrelation,true);assert.equal(stored.length,1);
 job.call_id=actual;await mod.exports.replayUnmatched(actual);
 assert.equal(job.status,'ended');assert.equal(stored[0].consumed,true);assert.ok(actions.has('outcome:'+actual));
 await mod.exports.replayUnmatched(actual);assert.equal(actions.size,1);
});
