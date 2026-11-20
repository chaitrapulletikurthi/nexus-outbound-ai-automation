'use strict';
const {phone}=require('./core');
const known=new Set(['buyerId','buyerName','phone','topDeals','propertyBriefing','idempotencyKey','campaignId']);
const goodText=(v,max)=>typeof v==='string' && v.trim().length>0 && v.length<=max;
function validateJob(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('invalid_job');
 if(Object.keys(input).some(k=>!known.has(k)))throw Error('unexpected_job_field');
 if(!goodText(input.buyerId,128)||!goodText(input.idempotencyKey,128)||!/^[a-f0-9]{64}$/.test(input.idempotencyKey)||!phone(input.phone)||!Array.isArray(input.topDeals)||input.topDeals.length<1||input.topDeals.length>3)throw Error('invalid_job');
 if(typeof input.buyerName!=='string'||input.buyerName.length>100||!goodText(input.propertyBriefing,12000)||JSON.stringify(input).length>24000)throw Error('invalid_job');
 for(const d of input.topDeals){if(!d||typeof d!=='object'||Array.isArray(d)||!goodText(d.dealId,120)||!goodText(d.summary,1500)||!goodText(d.city,150)||!goodText(d.matchedMetroId,150)||!goodText(d.description,5000))throw Error('invalid_listing_schema');}
 return input;
}
module.exports={validateJob};
