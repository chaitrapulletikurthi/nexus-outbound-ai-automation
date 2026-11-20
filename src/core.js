'use strict';
// Portable business controls. No phone calls, external data or secrets are used here.
const E164 = /^\+[1-9]\d{7,14}$/;
function phone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const n = digits.length === 10 ? `1${digits}` : digits;
  return /^1[2-9]\d{2}[2-9]\d{6}$/.test(n) ? `+${n}` : null;
}
function localClock(timezone, now = new Date()) {
  try {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
    return {weekday:parts.weekday,minute:Number(parts.hour)%24*60+Number(parts.minute)};
  } catch { return null; }
}
function quality(listings) {
  if (!Array.isArray(listings) || !listings.length || listings.length > 3) return ['invalid_listings'];
  const errors=[];
  for (const d of listings) {
    if (!d.dealId || !d.city || !d.metro || !d.summary || !Array.isArray(d.verifiedRegionIds) || !d.verifiedRegionIds.length) errors.push('missing_verified_listing_fields');
    if (d.listingStatus !== 'Available' || d.listingApproved !== true) errors.push('listing_not_approved_available');
    if (d.cityRegionVerified !== true) errors.push('city_region_not_verified');
    if (typeof d.description!=='string' || !d.description.trim() || d.description.length>5000) errors.push('missing_approved_description');
    if (d.priceVerified !== true || d.entryFee === undefined || d.entryFee === null || d.entryFee === '' || !Number.isFinite(Number(d.entryFee)) || Number(d.entryFee)<0) errors.push('price_not_verified');
    if (!d.lastVerifiedAt || !Number.isFinite(Date.parse(d.lastVerifiedAt)) || Date.now()-Date.parse(d.lastVerifiedAt)>24*3600000 || Date.parse(d.lastVerifiedAt)>Date.now()) errors.push('listing_verification_stale');
  }
  return [...new Set(errors)];
}
function consentAndEligibility(buyer, history={}, opts={}) {
  const now=opts.now || new Date(), reasons=[];
  const dest=phone(buyer.phone);
  if (!dest || !E164.test(dest)) reasons.push('invalid_phone');
  if (!buyer.buyerId) reasons.push('missing_buyer_id');
  if (buyer.aiVoiceConsent !== true || buyer.consentRevokedAt) reasons.push('no_current_ai_voice_consent');
  if (!buyer.consentEvidenceId || !buyer.consentTextVersion || !buyer.consentedAt || !Number.isFinite(Date.parse(buyer.consentedAt)) || (Date.parse(buyer.consentedAt)>now.getTime()) || phone(buyer.consentedPhone)!==dest) reasons.push('consent_evidence_incomplete');
  if (buyer.marketingConsentReviewed !== true || !buyer.consentScope || !buyer.consentSource || !buyer.consentReviewedAt || !Number.isFinite(Date.parse(buyer.consentReviewedAt)) || Date.parse(buyer.consentReviewedAt)>now.getTime()) reasons.push('consent_scope_unreviewed');
  if (!buyer.dncEvidenceId || !buyer.dncProvider || buyer.internalDnc !== false || buyer.stateDncClear !== true || buyer.nationalDncClear !== true || !buyer.dncScreenedAt || !Number.isFinite(Date.parse(buyer.dncScreenedAt)) || now.getTime()-Date.parse(buyer.dncScreenedAt)>30*86400000 || Date.parse(buyer.dncScreenedAt)>now.getTime()) reasons.push('dnc_not_cleared');
  if (buyer.stateRulesApproved !== true || buyer.recordingPlanApproved !== true ||
      !buyer.callingRulesEvidenceId || !buyer.recordingPlanEvidenceId ||
      !buyer.callingRulesReviewedAt || !Number.isFinite(Date.parse(buyer.callingRulesReviewedAt)) ||
      now.getTime()-Date.parse(buyer.callingRulesReviewedAt)>30*86400000 || Date.parse(buyer.callingRulesReviewedAt)>now.getTime())
    reasons.push('state_or_recording_rules_unreviewed');
  const clock=localClock(buyer.verifiedTimezone,now);
  // A conservative internal default, not a legal rule. Also intersect the
  // external policy service's reviewed state-specific calling window.
  if (!clock || !['Mon','Tue','Wed','Thu','Fri'].includes(clock.weekday) || clock.minute < 9*60 || clock.minute >= 20*60)
    reasons.push('outside_internal_call_window');
  const window=buyer.legalCallingWindow;
  const windowValid=window && Array.isArray(window.days) && window.days.length>0 &&
    window.days.every(day=>['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].includes(day)) &&
    Number.isInteger(window.startMinute) && Number.isInteger(window.endMinute) &&
    window.startMinute>=0 && window.endMinute<=1440 && window.startMinute<window.endMinute;
  if (buyer.allowedLocalWindowReviewed!==true || !windowValid || !buyer.callingWindowEvidenceId)
    reasons.push('calling_window_unreviewed');
  else if (clock && (!window.days.includes(clock.weekday) || clock.minute<window.startMinute || clock.minute>=window.endMinute))
    reasons.push('outside_reviewed_call_window');
  if (history.suppressed || history.active || history.unknownCall) reasons.push('suppressed_or_inflight');
  const cooldownMs=(opts.cooldownHours ?? 168)*3600000;
  if (history.lastAttemptAt && (now.getTime()-Date.parse(history.lastAttemptAt)<cooldownMs || !Number.isFinite(Date.parse(history.lastAttemptAt)))) reasons.push('contact_cooldown');
  if ((history.attemptsIn30Days ?? 0) >= (opts.maxAttemptsIn30Days ?? 2)) reasons.push('attempt_cap');
  return {eligible:reasons.length===0,reasons,normalizedPhone:dest};
}
function createCallPayload(job, assistantId, phoneNumberId) {
  if (!assistantId || !phoneNumberId) throw new Error('Vapi assistant and outbound phone IDs required');
  if (!phone(job.phone)) throw new Error('Invalid outbound phone');
  return {
    assistantId,phoneNumberId,customer:{number:phone(job.phone)},
    assistantOverrides:{variableValues:{buyer_name:String(job.buyerName||'there').slice(0,100),property_briefing:String(job.propertyBriefing||'').slice(0,8000),buyer_ref:String(job.buyerId||'').slice(0,100)}}
  };
}
const TERMINAL = new Set(['ended','blocked','failed']);
function mayTransition(from,to) {
 if (from===to) return true;
 const allowed={queued:['blocked','dialing'],dialing:['active','unknown','ended','blocked'],active:['ended','unknown'],unknown:['active','ended','blocked'],blocked:[],failed:[],ended:[]};
 return (allowed[from]||[]).includes(to);
}
function statusFromVapi(call) {
  if (!call || !call.id) return 'unknown';
  if (call.status==='ended' || call.endedAt) return 'ended';
  if (['queued','ringing','in-progress','forwarding','scheduled'].includes(call.status)) return 'active';
  return 'unknown'; // Unrecognized state holds queue; never assume finished
}
function safeToolAction(name,args) {
  if (!args || typeof args!=='object' || Array.isArray(args)) throw new Error('Invalid tool arguments');
  if(name==='record_interest') return {type:'interest',buyerRef:String(args.buyer_ref||''),listingRef:String(args.deal_id||''),value:args.interested===true};
  if(name==='request_callback') return {type:'callback',buyerRef:String(args.buyer_ref||''),requestedTime:String(args.preferred_time||'').slice(0,80),status:'requested_not_scheduled'};
  if(name==='do_not_call') return {type:'suppression',buyerRef:String(args.buyer_ref||''),reason:'verbal_opt_out'};
  throw new Error('Unsupported tool action');
}
module.exports={phone,localClock,quality,consentAndEligibility,createCallPayload,statusFromVapi,safeToolAction,mayTransition,TERMINAL};
