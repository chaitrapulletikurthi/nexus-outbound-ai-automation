'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {phone,quality,consentAndEligibility,createCallPayload,statusFromVapi,safeToolAction,mayTransition}=require('../src/core');
const now=new Date('2026-11-20T18:00:00Z'); // Friday 10 AM America/Los_Angeles
const approvedListing={dealId:'listing-demo-A',city:'Example City',metro:'Example Metro',summary:'Fictional listing',description:'Approved fictional listing detail',verifiedRegionIds:['region-demo-A'],listingStatus:'Available',listingApproved:true,cityRegionVerified:true,priceVerified:true,entryFee:1200,lastVerifiedAt:new Date().toISOString()};
const buyer={buyerId:'buyer-demo-A',phone:'4155550100',aiVoiceConsent:true,consentEvidenceId:'consent-demo-A',consentTextVersion:'v1',consentedAt:'2026-11-01T00:00:00Z',consentedPhone:'4155550100',marketingConsentReviewed:true,consentScope:'AI voice marketing',consentSource:'approved_demo_form',consentReviewedAt:'2026-11-19T17:00:00Z',dncEvidenceId:'screen-demo-1',dncProvider:'mock_registry',internalDnc:false,stateDncClear:true,nationalDncClear:true,dncScreenedAt:'2026-11-19T17:00:00Z',stateRulesApproved:true,recordingPlanApproved:true,callingRulesEvidenceId:'policy-fixture',recordingPlanEvidenceId:'recording-fixture',callingRulesReviewedAt:'2026-11-19T17:00:00Z',legalCallingWindow:{days:['Mon','Tue','Wed','Thu','Fri'],startMinute:540,endMinute:1200},callingWindowEvidenceId:'window-fixture',verifiedTimezone:'America/Los_Angeles',allowedLocalWindowReviewed:true};
test('phone validation and normalization',()=>{assert.equal(phone('(415) 555-0100'),'+14155550100');assert.equal(phone('garbage'),null)});
test('consent/DNC/timezone pass only with explicit approvals',()=>{
 assert.equal(consentAndEligibility(buyer,{}, {now}).eligible,true);
 assert.equal(consentAndEligibility({...buyer,aiVoiceConsent:false},{},{now}).eligible,false);
 assert.equal(consentAndEligibility({...buyer,nationalDncClear:null},{},{now}).eligible,false);
 assert.equal(consentAndEligibility({...buyer,verifiedTimezone:''},{},{now}).eligible,false);
 assert.equal(consentAndEligibility({...buyer,legalCallingWindow:{days:['Fri'],startMinute:1200,endMinute:1300}},{},{now}).eligible,false);
 assert.equal(consentAndEligibility({...buyer,callingRulesEvidenceId:null},{},{now}).eligible,false);
 assert.equal(consentAndEligibility(buyer,{suppressed:true},{now}).eligible,false);
 assert.equal(consentAndEligibility(buyer,{unknownCall:true},{now}).eligible,false);
 assert.equal(consentAndEligibility(buyer,{attemptsIn30Days:2},{now}).eligible,false);
 assert.equal(consentAndEligibility(buyer,{}, {now:new Date('2026-11-21T18:00:00Z')}).eligible,false);
});
test('quality checks reject missing approvals and bad region mapping',()=>{
 assert.deepEqual(quality([approvedListing]),[]);
 assert.ok(quality([{...approvedListing,cityRegionVerified:false}]).length>0);
 assert.ok(quality([{...approvedListing,listingApproved:false}]).length>0);
 assert.ok(quality([{...approvedListing,entryFee:'unknown'}]).includes('price_not_verified'));
 assert.ok(quality([{...approvedListing,entryFee:NaN}]).includes('price_not_verified'));
});
test('Vapi request uses approved dynamic variables',()=>{
 const body=createCallPayload({buyerName:'Taylor',buyerId:'buyer-demo-A',phone:'(415)555-0100',propertyBriefing:'Fictional listing'},'assistant-placeholder','number-placeholder');
 assert.equal(body.customer.number,'+14155550100');assert.equal(body.assistantOverrides.variableValues.buyer_ref,'buyer-demo-A');
 assert.equal(body.assistantOverrides.variableValues.property_briefing,'Fictional listing');
});
test('unknown state holds queue, ended state releases',()=>{
 assert.equal(statusFromVapi({id:'call-demo',status:'ended'}),'ended');
 assert.equal(statusFromVapi({id:'call-demo',status:'in-progress'}),'active');
 assert.equal(statusFromVapi({id:'call-demo',status:'unrecognized'}),'unknown');
});
test('tool actions reject unexpected tools',()=>{
 assert.equal(safeToolAction('do_not_call',{buyer_ref:'buyer-demo-A'}).type,'suppression');
 assert.throws(()=>safeToolAction('wire_money',{}));
});

test('terminal states cannot be reopened by stale status',()=>{assert.equal(mayTransition('ended','active'),false);assert.equal(mayTransition('ended','unknown'),false);assert.equal(mayTransition('active','ended'),true)});
