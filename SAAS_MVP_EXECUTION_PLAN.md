# IG Growth OS SaaS MVP Implementation Plan

## Scope delivered in this patch

- Added backend skeleton under `backend/`.
- Added tenant context middleware and server-side RBAC.
- Added tenant-safe post routes (read/write) as a reference implementation.
- Added tenant+user in-memory rate limits on read/write paths.
- Added tenant-scoped audit write/read path (`/api/audit-events`).
- Added repository abstraction to support `memory` and `postgres` providers.
- Added migration runner (`npm run migrate`) and dev seed (`npm run seed:dev`).
- Added auth provider abstraction to support `dev` and `oidc` modes.
- Added `docker-compose.postgres.yml` and `.env.postgres.example` for local postgres bootstrap.
- Upgraded OIDC mode to JWT+JWKS verification (`OIDC_ISSUER`/`OIDC_AUDIENCE`), replacing userinfo-only validation.
- Added configurable JWKS cache/cooldown/timeout settings and graceful shutdown for repository cleanup.
- Added normalized API error payload (`error` + `errorDetail`) and health metadata (`version`, `startedAt`, `uptimeMs`).
- Added richer audit metadata fields (`method`, `path`, `authProvider`, `repository`, `userAgent`) for SIEM tracing.
- Added immutable audit event envelope (`eventVersion`, `emittedAt`, `traceId`, `spanId`, `parentSpanId`) under `metadata.event`.
- Added `tenants.list` audit emission for visibility-scope lookups.
- Added audit query filters on `/api/audit-events` (`action`, `actorId`, `since`, `limit`).
- Extended audit query filters with `resourceType`, `requestId`, and `traceId` for incident tracing.
- Added MVP auth endpoints for frontend self-service account registration/login in memory provider.
- Added SQL drafts for bridge schema, tenant domain schema, and RLS isolation.

## Next build steps

1. Replace dev token parsing with real OIDC verification.
2. Replace in-memory data store with Postgres repositories.
3. Add audited support sessions and impersonation guard.
4. Add Stripe entitlement checks for plan limits.
5. Add tenant-scoped backup/restore jobs and runbook.

## API implementation checklist

- [ ] `GET /api/tenants` from bridge membership table.
- [ ] `GET /api/posts` with tenant context injection to DB session.
- [ ] `POST /api/posts` with RBAC + audit event.
- [x] `GET /api/products` + `POST /api/products`.
- [x] `PUT /api/products/:id` + `DELETE /api/products/:id`.
- [ ] `POST /api/prompts/generate` with tenant policy checks.
- [ ] `POST /api/dm/generate` with tenant policy checks.

## Security checklist

- [ ] No trust in client tenant id without membership re-check.
- [ ] RLS on all tenant tables.
- [ ] Audit events for all privileged routes.
- [ ] Per-tenant + per-user rate limits.
- [ ] Support impersonation requires reason + TTL.

---

## Integrated Feature Execution Blueprint v1 (User Needs + UX)

### Objective

Deliver the next product layer by prioritizing user activation, daily execution efficiency,
conversion loop quality, and SaaS trust.

### Priority Model

- `P0`: Activation and conversion-critical; immediate user value.
- `P1`: Retention and collaboration.
- `P2`: Expansion and advanced automation.

Sizing: `S` (<=3 dev-days), `M` (4-10 dev-days), `L` (11+ dev-days).

### P0 (Execute first)

1) Guided onboarding flow (wizard + checklist) - `M`
- Pain solved: new users cannot find first value path quickly.
- API: `GET /api/onboarding/state`, `POST /api/onboarding/step-complete`.
- Data: `tenant_onboarding_state`.
- Frontend: onboarding block + setup modal + checklist.
- Acceptance: first weekly plan completed within 10 minutes median.

2) Industry starter templates - `M`
- Pain solved: blank-page problem in first-week planning.
- API: `GET /api/templates`, `POST /api/templates/:id/apply`.
- Data: `template_catalog`, `tenant_template_applies`.
- Frontend: template picker in onboarding + weekly planning.
- Acceptance: one-click apply creates complete 1-week draft plan.

3) DM intent router + reply playbook - `M`
- Pain solved: inconsistent DM response quality and slower conversion.
- API: `POST /api/dm/classify-intent`, `POST /api/dm/reply-playbook`.
- Data: `dm_intent_rules`, `dm_reply_playbooks`.
- Frontend: DM intent panel + one-click reply actions.
- Acceptance: all new DM threads show intent and suggested reply.

4) KPI anomaly alerts with fix hints - `M`
- Pain solved: teams detect KPI drops too late.
- API: `GET /api/alerts`, `POST /api/alerts/rules`.
- Data: `alert_rules`, `alert_events`.
- Frontend: alert inbox with quick-fix links.
- Acceptance: threshold breach creates visible alert with suggested action.

### P1 (Retention + collaboration)

5) Unified daily workspace - `M`
- API: `GET /api/workspace/daily`.
- Data: computed view based on existing tables.
- Acceptance: top-5 daily actions executable from one screen.

6) Resource comments + mentions - `M`
- API: `POST /api/comments`, `GET /api/comments?...`.
- Data: `resource_comments`, `mention_notifications`.
- Acceptance: mentions produce actionable in-context tasks.

7) Shared report links with scope and expiry - `M`
- API: `POST /api/reports/share`, `GET /api/reports/shared/:token`.
- Data: `shared_report_links`.
- Acceptance: share link enforces permission scope and expiry, audited.

8) Bulk actions for posts/products - `S/M`
- API: `POST /api/posts/batch`, `POST /api/products/batch`.
- Data: no new table required.
- Acceptance: batch mutation returns clear success/failure summary.

### P2 (Expansion + advanced automation)

9) Integration hub (Sheets/Shopify/Meta Ads/Slack) - `L`
- API: `GET /api/integrations`, `POST /api/integrations/:provider/connect`.
- Data: `tenant_integrations`, `integration_sync_runs`.

10) Usage-based entitlements and billing hooks - `L`
- API: `GET /api/billing/entitlements`, `POST /api/billing/checkout-session`.
- Data: `tenant_usage_counters`, `tenant_plan_subscriptions`.

11) AI next-best-action insight assistant - `L`
- API: `POST /api/insights/next-actions`.
- Data: optional `insight_snapshots`.

### 8-Week Delivery Suggestion

- Week 1-2: P0-1, P0-2
- Week 3-4: P0-3, P0-4
- Week 5-6: P1-1, P1-2
- Week 7-8: P1-3, P1-4

Run P2 after P0/P1 KPI gates are met.

### KPI Gates

Move P0 -> P1 when:
- Onboarding completion >= 60%
- Time to first weekly plan <= 10 min median
- DM assisted reply usage >= 50%

Move P1 -> P2 when:
- WAU/MAU >= 0.45
- Weekly active tenant retention >= 85%
- Alert false-positive rate <= 20%

### Definition of Done (per feature)

- API contract documented in `backend/README.md`.
- Tenant isolation test coverage added.
- Audit event emitted for privileged write actions.
- Frontend UX verified on desktop and mobile.
- Smoke/integration path updated.
