# Vapi connection and settings

A practical checklist for connecting an n8n-prepared buyer to an outbound Vapi call.

## 1. Account and access

- Sign in to the correct Vapi organization. Have permission to view its assistant, phone numbers, tools and private API credentials.
- Store the private API key only in n8n credentials or a secrets manager. Do not put it in a node's exported JSON.
- Select a **saved, published outbound assistant**. Test drafts separately from the calling configuration.

## 2. Phone number: important prerequisite

Vapi's free test number is not a substitute for an outbound-enabled number. Import an eligible number from **Telnyx or Twilio** (or another supported provider) and use the returned `phoneNumberId` for calls. Confirm number ownership, outbound permissions, funding, region and caller ID. See [provider guide](phone-providers.md).

## 3. Voice assistant settings

| Setting | Check |
|---|---|
| Model and voice | Chosen model, speech voice, speed and language |
| Transcription | Recognition model and language |
| System prompt | Use [sectioned prompt](../prompts/outbound-assistant.md) |
| Variables | Add `{{buyer_name}}`, `{{buyer_ref}}`, `{{property_briefing}}` to the saved prompt |
| First message | Identify business and AI nature; do not falsely claim consent |
| Tools | Configure `record_interest`, `request_callback`, `do_not_call` with authenticated endpoint |
| Events | Subscribe to `status-update`, `end-of-call-report`, and `tool-calls` as applicable |
| Recording | Choose settings and disclosures after legal review |
| End behavior | Confirm hang-up, silence, voicemail, duration and transfer policies |
| Calls and costs | Check provider concurrency, account limits and usage dashboard |

## 4. Create outbound call

`POST https://api.vapi.ai/call` with `Authorization: Bearer <PRIVATE_VAPI_KEY>` and JSON:

```json
{
  "assistantId": "REPLACE_WITH_SAVED_ASSISTANT_ID",
  "phoneNumberId": "REPLACE_WITH_IMPORTED_OUTBOUND_PHONE_ID",
  "customer": {"number": "REPLACE_WITH_APPROVED_E164_NUMBER"},
  "assistantOverrides": {"variableValues": {
    "buyer_name": "Taylor",
    "buyer_ref": "buyer-demo-A",
    "property_briefing": "Fictional approved property summary"
  }}
}
```

**Why variables?** A call-specific `model.messages` override can replace the saved system prompt, removing tools or safety rules. Variables preserve the saved assistant instructions.

The Node client is in [`src/vapi.js`](../src/vapi.js). A matching request sample is in [`examples/`](../examples/).

## 5. Webhook and tool settings

- Set a public HTTPS **Server URL** on the saved assistant, not only an ad-hoc call override.
- Configure a Vapi custom authentication credential. This implementation expects `Authorization: Bearer <WEBHOOK_BEARER_TOKEN>`; validate it before processing the request. Vapi also supports HMAC authentication for stricter verification.
- Point the server URL to `POST /vapi/webhook` on your private coordinator.
- Match Vapi tool names and argument schemas to the prompt. Verify returned tool results in the dashboard.
- Watch webhook logs for failed deliveries; the queue also polls `GET /call/{id}` as a fallback.

## 6. Frequent connection problems

| Symptom | First check |
|---|---|
| API 401 | Private key, organization and authorization header |
| Call won't start | Imported phone number, outbound permissions, billing |
| Agent ignores buyer details | Variables absent from saved prompt or mismatched names |
| Calls run together | Missing persistent active-call check; `Loop Over Items` alone isn't enough |
| Webhook missing | Server URL, event subscriptions, firewall and authentication |
| Callback isn't saved | Tool signature, webhook reply and private CRM integration |

Sources: [Vapi outbound calling](https://docs.vapi.ai/calls/outbound-calling), [create call](https://docs.vapi.ai/api-reference/calls/create), [assistant overrides](https://docs.vapi.ai/assistants/assistant-overrides), [server events](https://docs.vapi.ai/server-url/events), [server authentication](https://docs.vapi.ai/server-url/server-authentication).

## Important webhook behavior

Vapi can omit configured authorization on some high-frequency event types, including `status-update`. This reference requires an authenticated webhook for tool calls and end reports, and uses authenticated `GET /call/{id}` polling for call state. Confirm your Vapi server URL's credential configuration at the organization, phone-number, assistant, and tool levels; tool-specific URLs can override assistant settings. Ensure `tool-calls` and `end-of-call-report` are subscribed.

The assistant uses `assistantOverrides.variableValues` to receive per-buyer context and must reference `{{buyer_name}}`, `{{property_briefing}}`, and `{{buyer_ref}}` in its saved prompt. The model's tool arguments are not trusted as identity proof: the backend resolves the buyer from the authenticated call ID and confirms the listing belongs to that call.

Provider docs: https://docs.vapi.ai/server-url/server-authentication and https://docs.vapi.ai/server-url/events
