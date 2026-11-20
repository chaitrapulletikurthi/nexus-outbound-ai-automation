# v6 — Health monitoring correction

- Added `GET /ready`: a bounded database probe returning 503 if PostgreSQL cannot be reached. No private connection information is exposed.
- Kept `GET /health` as process-only liveness.
- Updated the independent monitor to require both readiness and clean queue alerts.
- Added HTTP readiness and monitor regression tests.
- Updated operations and README documentation.

No live provider, CRM, consent, or database acceptance testing was performed as part of this patch.
