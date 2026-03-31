# IG Growth OS Core API (MVP)

This is a first production-oriented backend skeleton for multi-tenant SaaS migration.

## What is included

- Tenant context resolution from request headers.
- Server-side RBAC guard (owner/manager/editor/viewer).
- Tenant-scoped post endpoints (`GET /api/posts`, `POST /api/posts`, `PUT /api/posts/:id`, `DELETE /api/posts/:id`).
- Tenant-scoped onboarding endpoints (`GET /api/onboarding/state`, `POST /api/onboarding/step-complete`).
- Tenant-scoped templates endpoints (`GET /api/templates`, `POST /api/templates/:id/apply`).
- Tenant-scoped DM endpoints (`POST /api/dm/classify-intent`, `POST /api/dm/reply-playbook`).
- Tenant-scoped alerts endpoints (`GET /api/alerts`, `POST /api/alerts/rules`).
- Tenant-scoped workspace endpoint (`GET /api/workspace/daily`).
- Tenant-scoped content upgrade endpoints (`GET /api/content-upgrade`, `POST /api/content-upgrade/apply`).
- Tenant-scoped content upgrade history endpoint (`GET /api/content-upgrade/history`).
- Tenant-scoped content upgrade batch KPI endpoint (`GET /api/content-upgrade/batch-kpi`).
- Tenant-scoped content upgrade monthly mission endpoint (`GET /api/content-upgrade/monthly-mission`).
- Tenant-scoped content upgrade monthly mission apply endpoint (`POST /api/content-upgrade/monthly-mission/apply`).
- Tenant-scoped content upgrade replay endpoint (`POST /api/content-upgrade/replay`).
- Tenant-scoped brand strategy intake endpoints (`GET /api/brand-strategy/intake`, `POST /api/brand-strategy/intake`).
- Tenant-scoped brand strategy plan endpoints (`POST /api/brand-strategy/generate`, `GET /api/brand-strategy/plan`).
- Tenant-scoped shared report create endpoint (`POST /api/reports/share`).
- Public shared report read endpoint (`GET /api/reports/shared/:token`).
- Tenant-scoped post batch mutation endpoint (`POST /api/posts/batch`).
- Tenant-scoped product batch mutation endpoint (`POST /api/products/batch`).
- Tenant-scoped comments endpoints (`GET /api/comments`, `POST /api/comments`).
- Tenant-scoped product endpoints (`GET /api/products`, `POST /api/products`, `PUT /api/products/:id`, `DELETE /api/products/:id`).
- Tenant-scoped audit endpoint (`GET /api/audit-events`).
- Tenant+user rate limit guard for read/write routes.
- Repository abstraction (`memory` and `postgres` adapters).
- Postgres SQL migration drafts for bridge schema, tenant domain schema, and RLS policies.

## Data provider switch

- Default: `DATA_PROVIDER=memory`
- Postgres: set `DATA_PROVIDER=postgres` and `DATABASE_URL`

## Auth provider switch

- Default: `AUTH_PROVIDER=dev`
- OIDC: `AUTH_PROVIDER=oidc` with JWT verification via JWKS
  - `OIDC_ISSUER` (required)
  - `OIDC_AUDIENCE` (required)
  - `OIDC_JWKS_URI` (optional, defaults to `${OIDC_ISSUER}/.well-known/jwks.json`)
  - `OIDC_JWKS_CACHE_MAX_AGE_MS` (optional, default `600000`)
  - `OIDC_JWKS_COOLDOWN_MS` (optional, default `30000`)
  - `OIDC_JWKS_TIMEOUT_MS` (optional, default `5000`)

## Database setup (postgres)

```bash
npm run migrate
npm run seed:dev
```

`seed:dev` creates baseline users/tenants/memberships for local testing.

Seeded login accounts (after `npm run seed:dev`):
- `owner@example.com` / `123456`
- `editor@example.com` / `123456`

Posts persistence schema (backend-authoritative mode):
- `id`, `date`, `week`, `type`, `status`, `title`, `script`, `cta`, `link`, `triggerTags`, `metrics`
- `metrics` shape: `{ reach, saves, dms, clicks, orders }`

If you use Docker locally:

```bash
docker compose -f docker-compose.postgres.yml up -d
cp .env.postgres.example .env
```

## Runtime notes

- Server handles `SIGINT`/`SIGTERM` and closes repository connections gracefully.
- Health response includes `version`, `startedAt`, and `uptimeMs` for monitoring.
- Error responses keep `error` string and add `errorDetail` object (`code`, `message`, `retryAfterMs`).
- Audit metadata now includes `method`, `path`, `authProvider`, `repository`, and `userAgent` for request correlation.
- Audit metadata contains immutable event envelope at `metadata.event`:
  - `eventVersion`, `emittedAt`, `traceId`, `spanId`, `parentSpanId`
- Request tracing headers:
  - `x-request-id` (optional)
  - `x-trace-id` (optional, defaults to `x-request-id`)
  - `x-parent-span-id` (optional)
- `GET /api/tenants` now emits `tenants.list` audit events (one event per visible tenant scope).

## Dev auth simulation

Use a bearer token in this format:

- `Authorization: Bearer dev_user_u_owner`
- `Authorization: Bearer dev_user_u_editor`
- `Authorization: Bearer dev_user_u_viewer`

Also send:

- `x-tenant-id: tenant_default` or `tenant_kilikuru`

## Frontend registration/login MVP

- `POST /api/auth/register` with `{ email, password, storeName }`
- `POST /api/auth/login` with `{ email, password }`
- Response returns `{ actorId, token, items }` for immediate frontend session bootstrap.
- Works with both repository providers (`memory` / `postgres`) after running latest migrations.

### Internal-only registration mode (recommended for team testing)

Use these env vars to keep registration open only for internal staff while testing:

- `AUTH_REGISTER_ENABLED` (default `true`)
- `AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX` (optional regex, case-insensitive)

Example (allow only `@yourcompany.com`):

```bash
AUTH_REGISTER_ENABLED=true AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX="@yourcompany\\.com$" npm run start
```

Behavior:
- register closed: `403 auth_register_disabled`
- email not allowlisted: `403 auth_register_email_not_allowed`

## Frontend backend base URL override

Frontend `app.js` reads backend base URL in this order:
- Query param: `?backend_api_base=http://127.0.0.1:8793`
- Local storage key: `ig_ops_backend_api_base_v1`
- Default fallback: `http://127.0.0.1:8793`

This lets you switch ports/environments without editing source.

You can also edit API Base directly from the top auth toolbar in frontend:
- Dropdown `近期 API Base` for quick switching between recent endpoints
- Button `清除歷史` to wipe the recent endpoint dropdown
- Input field `後端 API Base`
- `儲存 API Base` (saves to localStorage and reloads)
- `重設 API Base` (resets to default and reloads)

## Run

```bash
npm run start
```

Server default port: `8793`

## Quick checks

```bash
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" http://127.0.0.1:8793/api/posts
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" http://127.0.0.1:8793/api/products
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"title\":\"new campaign\"}" http://127.0.0.1:8793/api/posts
curl -X PUT -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"title\":\"new campaign v2\",\"type\":\"reels\",\"status\":\"draft\"}" http://127.0.0.1:8793/api/posts/<post-id>
curl -X DELETE -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" http://127.0.0.1:8793/api/posts/<post-id>
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" http://127.0.0.1:8793/api/onboarding/state
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"stepKey\":\"connect_backend\"}" http://127.0.0.1:8793/api/onboarding/step-complete
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" http://127.0.0.1:8793/api/templates
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{}" http://127.0.0.1:8793/api/templates/tpl_furniture_launch_v1/apply
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"postId\":\"p_default_001\",\"question\":\"這個價格大概多少\",\"selectedIntent\":\"price\"}" http://127.0.0.1:8793/api/dm/classify-intent
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"postId\":\"p_default_001\",\"postTitle\":\"示範貼文\",\"postLink\":\"https://example.com\",\"question\":\"這個價格大概多少\",\"intent\":\"price\"}" http://127.0.0.1:8793/api/dm/reply-playbook
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"metricKey\":\"reach\",\"operator\":\"lt\",\"threshold\":1000}" http://127.0.0.1:8793/api/alerts/rules
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" http://127.0.0.1:8793/api/alerts
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" http://127.0.0.1:8793/api/workspace/daily
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" http://127.0.0.1:8793/api/content-upgrade
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"packageId\":\"pkg_algo_refresh\"}" http://127.0.0.1:8793/api/content-upgrade/apply
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" "http://127.0.0.1:8793/api/content-upgrade/history?limit=10"
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" "http://127.0.0.1:8793/api/content-upgrade/history?limit=10&batchId=cu_apply_xxx"
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" "http://127.0.0.1:8793/api/content-upgrade/batch-kpi?batchId=cu_apply_xxx"
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" "http://127.0.0.1:8793/api/content-upgrade/monthly-mission?month=03"
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"month\":\"03\"}" http://127.0.0.1:8793/api/content-upgrade/monthly-mission/apply
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"batchId\":\"cu_apply_xxx\",\"expiresInDays\":7}" http://127.0.0.1:8793/api/reports/share
curl http://127.0.0.1:8793/api/reports/shared/<token>
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"ids\":[\"p_xxx\",\"p_yyy\"],\"status\":\"待上架\"}" http://127.0.0.1:8793/api/posts/batch
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"ids\":[\"g_xxx\",\"g_yyy\"],\"status\":\"paused\"}" http://127.0.0.1:8793/api/products/batch
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"sourceRequestId\":\"req_xxx\"}" http://127.0.0.1:8793/api/content-upgrade/replay
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"sourceHistoryId\":\"audit_event_id\"}" http://127.0.0.1:8793/api/content-upgrade/replay
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"brandName\":\"Kilikuru\",\"industry\":\"furniture\",\"targetAudience\":\"25-40 歲租屋族\",\"businessGoal\":\"提升私訊詢單率\",\"tone\":\"專業親切\",\"keywords\":[\"小坪數\",\"改造\"]}" http://127.0.0.1:8793/api/brand-strategy/intake
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" http://127.0.0.1:8793/api/brand-strategy/intake
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"intakeId\":\"<intake-id>\"}" http://127.0.0.1:8793/api/brand-strategy/generate
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" http://127.0.0.1:8793/api/brand-strategy/plan

`POST /api/content-upgrade/apply` returns an execution-oriented payload including:
- `actions` and `deliverables`
- `generatedTasks` (workspace-like task objects)
- `draftPosts` (post-like draft objects that are also persisted as new drafts)
- `createdPostIds` and `appliedCount`
- `batchId` (campaign-like batch identifier)
- `executionSummary` (`taskCount`, `draftCount`, `generatedAt`)

`GET /api/content-upgrade/history` now returns both:
- `content_upgrade.apply`
- `content_upgrade.monthly_mission.apply`

so package-based and monthly-mission-based batches share the same history/filter/replay surface.

curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" "http://127.0.0.1:8793/api/comments?resourceType=post&resourceId=p_default_001"
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"resourceType\":\"post\",\"resourceId\":\"p_default_001\",\"body\":\"@u_owner 這篇 CTA 可以再強一點\"}" http://127.0.0.1:8793/api/comments
curl -X POST -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"name\":\"demo product\",\"price\":1999}" http://127.0.0.1:8793/api/products
curl -X PUT -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" -H "content-type: application/json" -d "{\"name\":\"demo product v2\",\"price\":2099}" http://127.0.0.1:8793/api/products/<product-id>
curl -X DELETE -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" http://127.0.0.1:8793/api/products/<product-id>
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" http://127.0.0.1:8793/api/audit-events
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" "http://127.0.0.1:8793/api/audit-events?action=posts.create&actorId=u_owner&limit=10"
curl -H "Authorization: Bearer dev_user_u_owner" -H "x-tenant-id: tenant_default" "http://127.0.0.1:8793/api/audit-events?resourceType=posts&requestId=req_a2&traceId=req_a2"

# rate-limit quick check
RATE_LIMIT_READ_PER_WINDOW=2 npm run start

# end-to-end smoke (requires running backend)
BASE_URL=http://127.0.0.1:8793 npm run smoke

# smoke with internal-only registration guard
AUTH_REGISTER_ENABLED=true AUTH_REGISTER_EMAIL_ALLOWLIST_REGEX="@yourcompany\\.com$" ISOLATION_EMAIL="smoke_user@yourcompany.com" BASE_URL=http://127.0.0.1:8793 npm run smoke

# smoke covers: health/auth/tenants/posts CRUD/products CRUD/content-upgrade apply persistence/history/batch-kpi/monthly-mission/monthly-mission-apply/replay/brand-strategy intake+generate+plan/comments/audit-events(requestId+traceId, create/update/delete actions)/tenant isolation

Shared report links are currently implemented for `content_upgrade_batch` snapshots:
- create a tokenized link with optional `batchId` and expiry (1-30 days)
- public read returns batch KPI + matching content-upgrade history for that batch

Batch mutation endpoints currently support status-only updates and return:
- `targetStatus`
- `requestedCount`
- `successCount`
- `failedCount`
- `results[]` with `{ id, ok, status? , error? }`
# isolation account can be customized (defaults are stable/reusable):
# ISOLATION_EMAIL, ISOLATION_PASSWORD, ISOLATION_STORE_NAME
```
