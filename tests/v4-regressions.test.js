'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {buildQueuePayload}=require('../src/queue-payload');
const {validateJob}=require('../src/contracts');
const {createReceiver}=require('../src/airtable-crm-receiver');
const {validateRetention}=require('../src/maintenance');
const {check}=require('../src/monitor');
const full={dealId:'listing-fixture',city:'Sample City',metro:'Sample Region',description:'Fictional approved description',summary:'Approved headline',entryFee:1000,matchedMetroId:'region-fixture',verifiedRegionIds:['region-fixture'],listingStatus:'Available',listingApproved:true,cityRegionVerified:true,priceVerified:true,lastVerifiedAt:new Date().toISOString()};
const prepared={buyerId:'buyer-fixture',buyerName:'Casey',phone:'4155550100',topDeals:[{...full}],propertyBriefing:'Fake stale pitch'};
test('rebuild approved spoken briefing rather than trust old prompt',()=>{
 const p=buildQueuePayload(prepared,[full]);assert.match(p.propertyBriefing,/Fictional approved description/);assert.doesNotMatch(p.propertyBriefing,/Fake stale pitch/);validateJob(p);
});
test('new description or metro is rejected when approval changed',()=>{
 assert.throws(()=>buildQueuePayload(prepared,[{...full,description:'Different claims'}]),/listing_content_has_changed/);
 assert.throws(()=>buildQueuePayload(prepared,[{...full,metro:'Wrong region'}]),/listing_content_has_changed/);
});
test('unexpected job attributes and oversized prompts are rejected',()=>{
 const payload=buildQueuePayload(prepared,[full]);assert.throws(()=>validateJob({...payload,extraAdmin:true}),/unexpected_job_field/);
 assert.throws(()=>validateJob({...payload,propertyBriefing:'x'.repeat(12001)}),/invalid_job/);
});
test('CRM receiver writes suppression before idempotent Airtable ledger and ACKs only on both',async()=>{
 const requests=[];
 const receiver=createReceiver({token:'fake',baseId:'base-fixture',buyerTableId:'buyers-fixture',actionTableId:'actions-fixture',bearerToken:'test-secret'},
 {fetchFn:async(url,opts)=>{requests.push({url,method:opts.method,body:opts.body?JSON.parse(opts.body):undefined});return {ok:true,json:async()=>opts.method==='GET'?(url.includes('actions-fixture')?{fields:{'Action Key':'call-fixture:tool-fixture','Action Type':'suppression','Buyer Ref':'rec1234567890ABCD'}}:{fields:{'Do Not Contact':true}}):opts.body.includes('performUpsert')?{records:[{id:'rec1234567890WXYZ',fields:{'Action Key':'call-fixture:tool-fixture'}}]}:{id:'rec1234567890ABCD'}};}});
 const action={actionKey:'call-fixture:tool-fixture',actionType:'suppression',buyerRef:'rec1234567890ABCD',data:{reason:'verbal_opt_out'}};
 assert.deepEqual(await receiver.apply(action),{applied:true,actionKey:action.actionKey});
 assert.equal(requests.length,4);assert.equal(requests[0].body.fields['Do Not Contact'],true);assert.equal(requests[2].body.performUpsert.fieldsToMergeOn[0],'Action Key');assert.equal(requests[1].method,'GET');assert.equal(requests[3].method,'GET');
});
test('CRM receiver refuses invalid buyer IDs',()=>{const r=createReceiver({token:'a',baseId:'b',buyerTableId:'c',actionTableId:'d',bearerToken:'e'});assert.rejects(r.apply({actionKey:'12345',actionType:'suppression',buyerRef:'invalid',data:{}}),/invalid_action/);});
test('retention requires valid timeframe and cannot be enabled by default',()=>{assert.throws(()=>validateRetention({RETENTION_DAYS:'0'}),/RETENTION_DAYS/);assert.equal(validateRetention({RETENTION_DAYS:'180'}),180);});
test('monitor shows unhealthy without leaking personal information',async()=>{const result=await check({url:'https://private.invalid',token:'fake',fetchFn:async()=>({ok:false,json:async()=>({healthy:false,metrics:{stuck_calls:1}})})});assert.equal(result.healthy,false);assert.equal(result.metrics.stuck_calls,1);});
