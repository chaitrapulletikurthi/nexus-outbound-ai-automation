'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {buildQueuePayload}=require('../../src/queue-payload');
const {validateJob}=require('../../src/contracts');
const {createCallPayload}=require('../../src/core');
const root=path.resolve(__dirname,'../..');
const wf=JSON.parse(fs.readFileSync(path.join(root,'workflow/outbound-preparation-reference.json'),'utf8'));
const fixture=JSON.parse(fs.readFileSync(path.join(root,'examples/fictional-records.json'),'utf8'));
const node=name=>{const v=wf.nodes.find(x=>x.name===name);assert.ok(v,`missing node ${name}`);return v;};
const items=x=>x.map(json=>({json}));
function execute(name,history){
 const context={
  $:key=>({all:()=>history[key]||[]}),
  $input:{all:()=>history._previous||[]},
 };
 return vm.runInNewContext(`(function(){${node(name).parameters.jsCode}\n})()`,context,{timeout:2000});
}
test('REAL exported n8n Code nodes produce a queue-ready, provider-ready contract',()=>{
 const history={'Buyer Record Search':items(fixture.buyers),'Deals Search':items(fixture.listings)};
 history['Match Buyers to Deals']=execute('Match Buyers to Deals',history);
 history['Vapi Call Data Prep']=execute('Vapi Call Data Prep',history);
 history._previous=history['Vapi Call Data Prep'];
 history['Normalize Phone number']=execute('Normalize Phone number',history);
 history._previous=history['Normalize Phone number'];
 const review=execute('Queue Handoff Review',history);
 assert.equal(review.length,1);
 const prepared=review[0].json;
 assert.equal(prepared.topDeals.length,2);
 assert.equal(prepared.topDeals[0].matchedMetroId,'region-A','actual n8n stage must retain matched region');
 assert.equal(prepared.topDeals[0].dealId,'listing-example-002','highest-priority deal first');
 assert.equal(prepared.phone,'+14155550100');
 const approved=prepared.topDeals.map(d=>({...d,verifiedRegionIds:[d.matchedMetroId],listingStatus:'Available',listingApproved:true,cityRegionVerified:true,priceVerified:true,lastVerifiedAt:new Date().toISOString()}));
 const queued=buildQueuePayload(prepared,approved);
 validateJob(queued);
 const vapi=createCallPayload(queued,'assistant-placeholder','number-placeholder');
 assert.equal(vapi.customer.number,queued.phone);
 assert.match(vapi.assistantOverrides.variableValues.property_briefing,/Sample property B/);
 assert.equal(queued.topDeals[0].matchedMetroId,'region-A');
});
test('standalone scripts are identical to source embedded in exported workflow',()=>{
 const pairs=[['Match Buyers to Deals','01_match_buyers_to_listings.js'],['Vapi Call Data Prep','02_prepare_call_data.js'],['Normalize Phone number','03_normalize_phone.js']];
 for(const [n,f] of pairs){
  const actual=node(n).parameters.jsCode.replace(/\s+$/,'');
  const standalone=fs.readFileSync(path.join(root,'scripts',f),'utf8').replace(/\s+$/,'');
  assert.equal(actual,standalone,`script drift: ${n}`);
 }
});
test('queue handoff stays disabled, requires a credential and has complete wiring',()=>{
 const handoff=node('Queue API Handoff - DISABLED');
 assert.equal(handoff.disabled,true);
 assert.equal(handoff.parameters.method,'POST');
 assert.equal(handoff.parameters.authentication,'genericCredentialType');
 assert.equal(wf.active,false);
 assert.deepEqual(wf.pinData||{},{});
 const edge=wf.connections['Queue Handoff Review'].main[0][0];
 assert.equal(edge.node,handoff.name);
});
