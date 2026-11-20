'use strict';
const test=require('node:test');const assert=require('node:assert/strict');
const {buildQueuePayload}=require('../src/queue-payload');
const listing={dealId:'listing-fictional',matchedMetroId:'region-fictional',city:'Sample City',summary:'Sample house',description:'Fictional description',metro:'Fictional region',entryFee:1000};
const reviewed={...listing,verifiedRegionIds:['region-fictional'],listingStatus:'Available',listingApproved:true,cityRegionVerified:true,priceVerified:true,lastVerifiedAt:new Date().toISOString()};
const prepared={buyerId:'buyer-fictional',buyerName:'Casey',phone:'4155550100',topDeals:[listing],propertyBriefing:'Sample house'};
test('private listing review enables valid queue handoff',()=>{
 const payload=buildQueuePayload(prepared,[reviewed]);
 assert.equal(payload.topDeals[0].listingApproved,true);
 assert.equal(payload.phone,'+14155550100');
 assert.equal(payload.idempotencyKey.length,64);
});
test('unapproved or changed property data fails closed',()=>{
 assert.throws(()=>buildQueuePayload(prepared,[{...reviewed,listingApproved:false}]),/property_quality/);
 assert.throws(()=>buildQueuePayload(prepared,[{...reviewed,summary:'Unreviewed new price'}]),/listing_content_has_changed/);
 assert.throws(()=>buildQueuePayload(prepared,[{...reviewed,verifiedRegionIds:['other-region']}]),/verified_region_mismatch/);
 assert.throws(()=>buildQueuePayload(prepared,[{...reviewed,lastVerifiedAt:'2020-01-01T00:00:00Z'}]),/property_quality/);
});
