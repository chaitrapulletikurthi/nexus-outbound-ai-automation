# Verification matrix — known gaps and evidence

This is the consolidated record for the previously identified 42 items. **Implemented** means code or controls are present; **tested offline** means a fixture or mock verifies the behavior; **requires environment** means there is no honest way to validate it in this public repository. Neither label certifies lawful deployment.

## 1. Data flow and call lifecycle

| # | Area | Status and evidence |
|---|---|---|
| 1 | Preserve matched region ID | **Tested offline:** actual n8n exported JS → approved listing → queue contract → Vapi variable payload; `tests/integration/exported-workflow.test.js` |
| 2 | Dispatch versus revoked consent | **Mitigated, not atomic across providers:** database lock + final eligibility/suppression check; residual remote-API race requires carrier/Vapi controls and legal procedure |
| 3 | Queue finish versus CRM sync | **Implemented:** only confirmed end and cleared safety holds release the next dial; ordinary actions go to an idempotent retry outbox. README now reflects this policy |
| 4 | Full cross-system execution | **Tested with mocks:** actual n8n JS to Vapi payload; live Vapi/PostgreSQL/Airtable/DNC path requires environment |
| 5 | Retention transaction safety | **Tested offline:** dedicated client, locked recheck, rollback and release; `tests/retention-transaction.test.js` |
| 6 | Event ordering | **Tested with mocks:** per-call locks, conservative state machine and end-report holds |
| 7 | Event deduplication | **Tested with mocks:** stable event fingerprint, database uniqueness and idempotent action keys |
| 8 | CRM verification | **Tested with mocks:** read-back of buyer fields and ledger, no ACK for inconsistent writes; real Airtable mapping requires environment |
| 9 | Property fact consistency | **Tested offline:** approved region, city, summary, description, availability, fee and freshness checked; spoken briefing rebuilt from reviewed facts |
| 10 | Unknown-call reconciliation | **Tested with mocks:** admin action verifies provider identity and records audit; provider/telephony evidence requires environment |
| 11 | Restart recovery | **Implemented:** persistent queued/dialing/unknown state and no blind retry; crash/restart with real PostgreSQL requires environment |
| 12 | Multi-worker concurrency | **Test configured for CI:** actual PostgreSQL advisory locks and uniqueness; not executed locally without PostgreSQL |
| 13 | Cross-run attempts/cooldown | **Implemented, offline eligibility tests:** attempted-at timestamp only at dial request, phone-based history, cap and cooldown; operational acceptance required |
| 14 | Failure classification | **Implemented partly:** ended reason stored and uncertain status held; company-specific retry/no-answer policy requires live acceptance |
| 15 | Outbound webhook authentication | **Tested HTTP endpoint access:** separate bearer credentials; must configure actual Vapi server credentials and event subscriptions |
| 16 | CRM retries | **Tested with mocks:** durable outbox, backoff and idempotent ACKs |
| 17 | Missing final outcome | **Implemented:** polling, missing-report hold and audited review; actual Vapi event delivery remains external |

## 2. Consent, security and privacy

| # | Area | Status and evidence |
|---|---|---|
| 18 | AI marketing consent | **External approval required:** private consent evidence and scope, fail-closed in `src/core.js` |
| 19 | Federal/state/internal DNC | **External approval required:** private screening service and local suppression, fail-closed when any check is unclear |
| 20 | Calling hours | **Implemented policy intersection:** internal weekday window plus state-reviewed local window/evidence, with private timezone verification required |
| 21 | Recording consent | **External legal and configuration requirement:** `recordingPlanApproved` and its evidence are required; no generic recording consent claim is made |
| 22 | Opt-out detection | **Implemented defense in depth:** agent tool, transcript phrase detection, local suppression and artifact-review hold; human review remains necessary |
| 23 | Data lifecycle | **Implemented retention utility:** legal holds, unsynced actions and pending reviews block deletion; apply only after privacy approval |
| 24 | Webhook security | **Tested auth and size limits:** separate token, request bounds, safe event mapping; Vapi account-level authentication needs validation |
| 25 | Administrative API access | **Tested HTTP auth:** separate admin/internal tokens; production rate limiting, network ACLs and credential rotation require deployment |
| 26 | Secrets, package and history | **Tested exported-tree scan:** no known internal IDs/credentials; public Git history scan and verified npm lockfile require external registry and git history |
| 27 | Number ownership/reputation | **External:** provider account authorization, caller ID, business verification and spam/reputation checks |

## 3. Tests and deployment

| # | Area | Status and evidence |
|---|---|---|
| 28 | Exported n8n code | **Tested:** no script drift and actual n8n JavaScript output contract, `tests/integration/exported-workflow.test.js` |
| 29 | Real PostgreSQL | **CI configured, not local:** `TEST_DATABASE_URL` runs database tests; use disposable database only |
| 30 | Vapi timeout/crash | **Mock-tested:** uncertain POST holds, no automatic redial |
| 31 | Event replay | **Mock-tested:** early webhook, duplicate delivery and stale transitions |
| 32 | Revocation during dispatch | **Mitigated:** local lock and extra preflight check; no distributed transaction across external Vapi/consent service is possible |
| 33 | Airtable write path | **Mock-tested:** suppression read-back, optional callback fields, idempotent action upsert; real base/field types require acceptance |
| 34 | Stuck call and escalation | **Implemented:** queue alerts, monitor and manual review process; configure operators and delivery channel externally |
| 35 | Reproducible installs | **Requires npm registry:** direct `pg` version is pinned; a genuine lockfile could not be generated offline; generate and commit, then switch CI to `npm ci` |
| 36 | Environment deployment | **Documented:** schema upgrades, secrets, TLS, monitoring and launch gates; private services not deployed by this repo |
| 37 | Authorized live call acceptance | **External:** only approved test phone, real provider logs, DNC/consent review and controlled launch |

## 4. GitHub documentation

| # | Area | Status and evidence |
|---|---|---|
| 38 | Architecture vs implementation | **Documented:** simple Mermaid flowchart plus reference-versus-deployed scope |
| 39 | Setup sequence | **Documented:** README and service-specific guides, with required private mappings |
| 40 | Troubleshooting | **Documented:** operations, recovery, Vapi setup, queue alerts and error paths |
| 41 | Data contracts | **Tested/documented:** n8n, reviewed listing, queue payload, Vapi variables and CRM actions |
| 42 | Ownership and permissions | **External:** business authorization and applicable licensing/publication rights must be confirmed before publication |

## Release decision

- **Public sanitized reference:** suitable for review after ownership approval and a full repository/history secret scan.
- **Live dialing:** **not authorized by this repository.** Requires actual consent/DNC service, current legal approvals, Vapi/carrier setup, configured Airtable field mappings, migrated PostgreSQL, registry-backed dependency installation, monitoring, and witnessed test calls.
- **Verification meaning:** passing mock tests supports implementation correctness at tested boundaries. It does **not** establish no remaining defects, successful real call orchestration, or legal compliance.
