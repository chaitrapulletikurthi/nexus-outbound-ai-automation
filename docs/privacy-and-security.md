# Security and privacy

- Store API keys in a secret manager, not in JSON workflow exports or `.env` files in Git.
- Restrict queue and CRM endpoints with HTTPS, bearer credentials, network policy and request-size limits. Rotate credentials.
- Save minimal audit metadata; avoid logging phone numbers, full customer messages, recordings and full transcripts.
- Vapi events vary in credential delivery. Treat the authenticated end-of-call/tool endpoint separately from status-update events that may arrive without a credential; poll Vapi for reliable call state.
- Use unique keys for each CRM action, retain delivery attempts, and replay safely.
- Use access controls and documented retention/deletion procedures for recordings, consent evidence, DNC screens, job history and audit events.
- Run secret scanning on Git history before publishing; static current-tree scans cannot prove history is clean.
- Company-owned logic should be published only with authorization.

Nothing here replaces applicable legal review of AI voice marketing consent, DNC, state-specific telemarketing and call-recording rules.
