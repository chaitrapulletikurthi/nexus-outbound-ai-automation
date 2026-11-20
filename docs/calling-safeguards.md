# Calling safeguards and government rules (US)

These checks must be designed for **the specific calling purpose, state, recipient and consent wording**. This is not legal advice.

| Before a call | Required decision |
|---|---|
| AI/artificial voice | Confirm applicable TCPA authorization and keep evidence. A phone number or SMS opt-in alone is not sufficient proof. |
| Marketing purpose | Review applicable **prior express written consent** requirements and permitted exceptions with counsel. |
| DNC | Screen applicable National DNC, state DNC and your internal opt-out list using authorized sources. Keep screening evidence. |
| Local calling window | Apply the recipient's verified time zone and relevant federal/state rules. The sample imposes a stricter **weekday 9 AM–8 PM local** policy, not a universal legal rule. |
| State rules | Review extra state requirements, including automated calls, call limits and disclosures. |
| Recording | Apply consent and notice rules for every relevant jurisdiction. |
| Caller identity | Identify the responsible business and respect caller ID/telemarketing identification requirements. |
| Buyer says stop | Suppress immediately and synchronize the opt-out across systems. |
| Data privacy | Limit access to phone numbers, transcripts, recordings and consent records; retain/delete by approved policy. |

**Fail closed:** `src/core.js` rejects missing/expired consent proof, unreviewed marketing permission, missing DNC clearance, missing time zone, weekend/quiet hours, unreviewed state/recording requirements, repeat attempts and unknown call states.

**What isn't in this repository:** National/state registry access, legal interpretation of exemptions, consent capture forms, subscriber identity verification, and carrier registration. These require approved outside systems and legal review—not hard-coded `true` values.

Primary sources: [FCC AI voice ruling (2024)](https://docs.fcc.gov/public/attachments/FCC-24-17A1.pdf), [FTC Telemarketing Sales Rule](https://www.ftc.gov/business-guidance/resources/complying-telemarketing-sales-rule), [FTC DNC guidance](https://www.ftc.gov/business-guidance/resources/qa-telemarketers-sellers-about-dnc-provisions-tsr-0).
