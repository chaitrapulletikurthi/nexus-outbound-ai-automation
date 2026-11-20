# Cost planning

Budget for four layers, not just the Vapi platform fee:

| Layer | Typical billing driver |
|---|---|
| Telephony | Monthly number rental, outbound minutes, number/carrier-related fees |
| Vapi voice platform | Connected-call minutes / plan features |
| AI stack | LLM tokens, transcription and generated speech (depending on selected providers) |
| Automation/storage | n8n hosting, database, CRM operations, call recording retention |

**Simple estimate:** `monthly spend ≈ number rental + connected minutes × (telephony rate + Vapi rate + estimated AI usage/minute) + infrastructure + storage`.

Get live prices and usage caps from the exact Vapi and Telnyx/Twilio plans. Short test calls, voicemail, failed attempts, call transfers and international routes may have different billable behavior. No fixed price estimates are embedded here because provider rates change.
