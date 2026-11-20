'use strict';
const crypto=require('node:crypto');
const {quality,phone}=require('./core');
// The private listing review service supplies verified, approved metadata.
// Never synthesize true approvals from a matching result.
function buildQueuePayload(prepared, reviewed, now=new Date()) {
  if(!prepared || !Array.isArray(prepared.topDeals) || !phone(prepared.phone) || !prepared.buyerId)throw Error('invalid_prepared_buyer');
  if(!Array.isArray(reviewed) || reviewed.length!==prepared.topDeals.length)throw Error('reviewed_listing_count_mismatch');
  const byId=new Map(reviewed.map(d=>[String(d.dealId),d]));
  if(byId.size!==reviewed.length)throw Error('duplicate_reviewed_listing');
  if(new Set(prepared.topDeals.map(d=>String(d.dealId))).size!==prepared.topDeals.length)throw Error('duplicate_prepared_listing');
  const topDeals=prepared.topDeals.map(d=>{
    const approved=byId.get(String(d.dealId));
    if(!approved || approved.summary!==d.summary || approved.city!==d.city || approved.description!==d.description || String(approved.metro)!==String(d.metro) || !Number.isFinite(Number(d.entryFee)) || Number(approved.entryFee)!==Number(d.entryFee))throw Error('listing_content_has_changed');
    if(!Array.isArray(approved.verifiedRegionIds) || !approved.verifiedRegionIds.includes(d.matchedMetroId))throw Error('verified_region_mismatch');
    return {...d,verifiedRegionIds:approved.verifiedRegionIds,listingStatus:approved.listingStatus,
      listingApproved:approved.listingApproved,cityRegionVerified:approved.cityRegionVerified,
      priceVerified:approved.priceVerified,lastVerifiedAt:approved.lastVerifiedAt};
  });
  const errors=quality(topDeals);if(errors.length)throw Error(`property_quality:${errors.join(',')}`);
  const briefing=topDeals.map((d,i)=>`Property ${i+1}\nDeal ID: ${d.dealId}\nCity: ${d.city}\nMetro: ${d.metro}\nSummary: ${d.summary}\nParticipation Fee: $${Number(d.entryFee).toLocaleString('en-US')}\nDetails: ${d.description}`).join('\n\n');
  const key=crypto.createHash('sha256').update(JSON.stringify({buyerRef:prepared.buyerId,listingIds:topDeals.map(d=>d.dealId),campaign:prepared.campaignId||'example',reviewedDay:now.toISOString().slice(0,10)})).digest('hex');
  return {buyerId:String(prepared.buyerId),buyerName:String(prepared.buyerName||'').replace(/[\r\n\t]+/g,' ').trim().slice(0,100),phone:phone(prepared.phone),
    topDeals,propertyBriefing:briefing,idempotencyKey:key};
}
module.exports={buildQueuePayload};
