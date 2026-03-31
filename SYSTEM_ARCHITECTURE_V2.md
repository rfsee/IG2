# IG Auto Growth OS - Multi-tenant System Architecture v3

## 1) Product Goal
- Sell one platform to multiple stores while ensuring strict tenant isolation.
- Business goal remains conversion growth: exposure -> intent -> DM -> click -> order.
- Isolation goal: Store A can never see Store B data, plans, outputs, or agent runs.

## 2) Isolation Contract (Default Deny)
- Every request, job, and agent run requires `tenant_context`.
- `tenant_context = { tenant_id, actor_id, actor_roles, request_id }`.
- `tenant_id` is derived server-side from authenticated membership, never trusted from request body.
- Missing context or invalid membership must fail closed.
- Any resource is tenant-scoped by default unless explicitly marked global.

## 3) Multi-tenant Topology

### Recommended rollout
1. Pool model: shared DB + shared schema + strict row isolation.
2. Bridge model: tenant-specific schema for mid/high tier.
3. Silo model: tenant-specific DB for enterprise compliance tier.

### Rationale
- Start cost-efficient, keep clean path toward stronger physical separation.

## 4) Agent-specialized Module Architecture

### A. Tenant & Access Service
- Manages tenants, users, memberships, role claims, and support sessions.

### B. Content Agent Service
- Generates hooks, captions, CTA, and trigger composition per tenant strategy.

### C. Visual Prompt Agent Service
- Converts script and caption intent into prompt blocks.
- Guardrail: prompt steps must align with narrative steps.

### D. Publishing Agent Service
- Handles status lifecycle and publish preflight checks.

### E. Engagement Agent Service
- Produces DM scripts, intent routing, and follow-up sequencing.

### F. Growth Analyst Agent Service
- Produces weekly diagnostics and next-cycle strategy from event metrics.

### G. Tenant-safe Data Service
- Handles import/export validation, schema migrations, backup/restore boundaries.

## 5) Tenant Context Propagation
1. API gateway resolves active tenant membership from auth token/session.
2. Service layer injects immutable tenant context into every domain call.
3. Job queue carries tenant context in payload; worker rejects missing context.
4. Agent run records are tenant-pinned and tool calls are tenant policy-checked.

## 6) Authorization Model

### Tenant roles
- `owner`: full store control including integration and export permissions.
- `manager`: operation control without billing-critical secrets.
- `editor`: content/DM execution, no high-risk admin operations.
- `viewer`: read-only reports and dashboards.

### Platform roles
- `support_readonly`: temporary diagnostics, read-only.
- `support_impersonate`: explicit audited support session only, time-boxed.

## 7) Data Isolation Layers
1. Application policy checks (actor-resource-action-tenant).
2. Database row isolation policies on all tenant-scoped tables.
3. Tenant-prefixed cache keys.
4. Tenant-prefixed storage/object keys.
5. Tenant-partitioned search index or mandatory tenant filter.
6. Tenant namespace for agent memory/context retrieval.

## 8) Backup, Restore, and Audit Controls
- Backup and restore operations are tenant-scoped by policy.
- Cross-tenant support actions require support session + reason code + TTL.
- Audit event baseline: actor, tenant, action, resource, request_id, timestamp, source_ip.
- Export files carry tenant watermark and retention expiry.

## 9) API Surface (High-level)
- `/api/tenant/*` tenant settings and workspace profile.
- `/api/products/*` catalog and metadata.
- `/api/posts/*` planning and publishing lifecycle.
- `/api/prompts/*` caption/prompt generation.
- `/api/dm/*` thread stages, scripts, follow-up actions.
- `/api/reports/*` funnel and weekly diagnostics.
- `/api/admin/support-sessions/*` audited support access.

## 10) Closed-loop Event Flow
1. Tenant product pool sync + tagging.
2. Content Agent draft generation.
3. Visual Prompt Agent prompt generation.
4. Publishing workflow progression.
5. Engagement Agent DM operations.
6. Event ingestion updates tenant metrics.
7. Growth Analyst produces next-cycle actions.

## 11) Security and Reliability Rules
- No credential material in frontend source.
- Tenant context validation before data access.
- Deterministic generation templates to reduce drift.
- Import failures are dry-run validated before commit.
- Restore operations are reversible and auditable.

## 12) Scope Boundary
- In scope: multi-tenant IG content + conversion automation with measurable feedback.
- Out of scope: payment processing, ERP, logistics, ad bidding automation.
