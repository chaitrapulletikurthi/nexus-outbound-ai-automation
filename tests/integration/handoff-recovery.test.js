'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const id='00000000-0000-4000-8000-000000000001',callId='00000000-0000-4000-8000-000000000002';
const deal={dealId:'listing-fixture',matchedMetroId:'region-fixture',city:'Sample City',metro:'Sample Region',summary:'Approved headline',description:'Approved fictional property description',entryFee:1000};
const reviewed={...deal,verifiedRegionIds:['region-fixture'],listingStatus:'Available',listingApproved:true,cityRegionVerified:true,priceVerified:true,lastVerifiedAt:new Date().toISOString()};
const prepared={buyerId:'buyer-fixture',buyerName:'Casey',phone:'4155550100',topDeals:[deal],propertyBriefing:'Stale and not trusted'};
const data={job:{id,buyer_ref:'buyer-fixture',phone_e164:'+14155550100',status:'unknown',call_id:null,dial_attempted_at:new Date().toISOString()},audit:[],flags:[],inserted:null};
async function query(sql,params=[]){
 const s=sql.replace(/\s+/g,' ').trim();
 if(s.startsWith('SELECT pg_advisory_lock')||s.startsWith('SELECT pg_advisory_unlock')||['BEGIN','COMMIT','ROLLBACK'].includes(s))return {rows:[]};
 if(s.startsWith('INSERT INTO outbound_jobs')){data.inserted=JSON.parse(params[3]);return {rows:[{id,status:'queued',call_id:null,blocked_reasons:[]}]};}
 if(s.startsWith('SELECT * FROM outbound_jobs WHERE id=$1 FOR UPDATE'))return {rows:[{...data.job}]};
 if(s.startsWith("UPDATE outbound_jobs SET status='ended'")){data.job.status='ended';data.job.call_id=params[1];return {rows:[]};}
 if(s.startsWith("UPDATE outbound_jobs SET status='blocked'")){data.job.status='blocked';return {rows:[]};}
 if(s.startsWith('INSERT INTO outbound_operator_audit')){data.audit.push(params);return {rows:[]};}
 if(s.startsWith('INSERT INTO outbound_reconciliation_flags')){data.flags.push(params);return {rows:[]};}
 if(s.startsWith('SELECT id,payload FROM outbound_unmatched_events'))return {rows:[]};
 throw Error('Unrecognized SQL in test '+s.slice(0,100));
}
const fakePool={query,connect:async()=>({query,release(){}})};
const source=fs.readFileSync(path.join(__dirname,'../../src/service.js'),'utf8'),mod={exports:{}};
const loader=n=>{
 if(n==='pg')return {Pool:class{constructor(){return fakePool;}}};
 if(n==='./vapi')return {VapiClient:class{async get(id){return {id,status:'ended',assistantId:'assistant-test',customer:{number:'4155550100'},createdAt:new Date().toISOString()};}}};
 return require(n.startsWith('.')?path.join(__dirname,'../../src',n):n);
};
const fakeEnv={LISTING_REVIEW_URL:'https://listing.example.invalid',LISTING_REVIEW_TOKEN:'fixture-token',VAPI_ASSISTANT_ID:'assistant-test'};
vm.runInNewContext('(function(require,module,exports,process,fetch,Buffer){'+source+'\n})',{setInterval,console,AbortSignal})(loader,mod,mod.exports,{env:fakeEnv},async()=>({ok:true,json:async()=>({listings:[reviewed]})}),Buffer);
test('n8n prepared buyer passes authoritative private listing check before queue insertion',async()=>{
 const result=await mod.exports.prepareAndEnqueue(prepared);assert.equal(result.status,'queued');assert.match(data.inserted.propertyBriefing,/Approved fictional property description/);assert.doesNotMatch(data.inserted.propertyBriefing,/Stale/);
});
test('operator reconciliation verifies provider identity and produces audit trail, no redial',async()=>{
 const result=await mod.exports.reconcileJob({jobId:id,resolution:'provider_ended',providerCallId:callId,evidenceRef:'TICKET-FIXTURE-123',reviewNote:'Confirmed identity and completed call in provider dashboard.'});
 assert.equal(result.status,'ended');assert.equal(data.job.call_id,callId);assert.equal(data.audit.length,1);assert.equal(data.flags.length,1);
});
test('manual confirmation no call turns unknown job into blocked without redial',async()=>{
 data.job.status='unknown';data.job.call_id=null;
 const result=await mod.exports.reconcileJob({jobId:id,resolution:'no_call_confirmed',evidenceRef:'TICKET-FIXTURE-456',reviewNote:'Confirmed no call across both provider and carrier histories.'});
 assert.equal(result.status,'blocked');assert.equal(result.nextAction,'no_retry');assert.equal(data.job.status,'blocked');
});
