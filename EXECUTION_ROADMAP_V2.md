# IG Auto Growth OS - Multi-tenant Execution Roadmap v3

## Phase 0 - Architecture Baseline (Week 0)
- Finalize multi-tenant architecture, schema, and access policy docs.
- Lock role model and tenant context contract.

### Entry Criteria
- Current single-tenant workflow is stable and documented.

### Exit Criteria
- Multi-tenant architecture docs approved.
- No unresolved placeholders in architecture package.

## Phase 1 - Tenant Identity and Access (Week 1)
- Implement tenants/users/memberships and active-tenant resolution.
- Add role-based authorization (`owner/manager/editor/viewer`).
- Add support session model for audited cross-tenant maintenance.

### Exit Criteria
- Authenticated user can only query assigned tenant scope.
- Unauthorized cross-tenant access attempts fail closed.

## Phase 2 - Tenant-safe Data Layer (Week 2)
- Add `tenant_id` to all tenant-scoped domain tables.
- Enforce row isolation policies (RLS or equivalent).
- Add migration path from local snapshot to tenant-scoped records.

### Exit Criteria
- DB queries without tenant context cannot return tenant records.
- Migration can replay existing single-tenant data into one tenant workspace.

## Phase 3 - Agent Workflow Segregation (Week 3)
- Split agent runs by tenant context and role claims.
- Enforce tenant-aware tool gateway and memory namespace boundaries.
- Add tenant-partitioned job queue keys.

### Exit Criteria
- Agent run from tenant A cannot read or write tenant B context.
- Tool call missing tenant context is rejected.

## Phase 4 - Import/Export and Backup Safety (Week 4)
- Add import dry-run validator for tenant-scoped CSV.
- Add tenant-scoped backup/restore jobs and rollback controls.
- Add export watermark and retention policy by tenant.

### Exit Criteria
- Import preview shows schema/type errors before commit.
- Restore operation is tenant-bound and fully audited.

## Phase 5 - Conversion Loop Productionization (Week 5)
- Move content/prompt/DM/report modules behind tenant-aware APIs.
- Add event ledger and derived funnel metrics per tenant.
- Add cross-tenant safe analytics aggregation for platform owner view.

### Exit Criteria
- Tenant dashboards show only tenant-owned metrics and outputs.
- Weekly growth recommendations are generated per tenant.

## Phase 6 - Security, Audit, and Reliability Hardening (Week 6)
- Add immutable audit event stream with actor + tenant + request correlation.
- Add support impersonation TTL and reason-code enforcement.
- Add disaster recovery drills with tenant-level restore verification.

### Exit Criteria
- Every privileged action has audit evidence.
- Support session abuse paths are blocked and test-covered.

## Agent Work Allocation (Multi-tenant)
- `Content Agent`: tenant-specific hooks/caption/CTA generation.
- `Visual Prompt Agent`: caption-aligned prompt blocks in tenant namespace.
- `Publishing Agent`: tenant queue/state transition enforcement.
- `Engagement Agent`: DM flow and follow-up sequencing per tenant.
- `Growth Analyst Agent`: per-tenant diagnostics and strategy outputs.
- `Tenant Safety Agent` (platform role): backup/audit/compliance checks.

## Verification Strategy per Phase
- Policy tests: unauthorized tenant access must fail.
- Data tests: tenant filters mandatory in persistence/read paths.
- Agent tests: cross-tenant prompt/context retrieval denied.
- Recovery tests: restore and rollback scoped to one tenant.

## Operational Rhythm
- Daily: status updates, metrics ingestion, DM thread progression per tenant.
- Weekly: tenant-level growth report generation and action planning.
- Monthly: tenant churn risk review, quality audit, and schema migration health check.

## Product Integrations Track (Execution Blueprint v1)

Cross-reference: `SAAS_MVP_EXECUTION_PLAN.md` -> section `Integrated Feature Execution Blueprint v1 (User Needs + UX)`.

Priority staging:
- P0: onboarding wizard/checklist, industry templates, DM intent playbooks, KPI anomaly alerts
- P1: daily workspace, comments/mentions, shared report links, batch actions
- P2: integration hub, usage-based entitlements, AI next-best-action insights

Transition gates:
- P0 -> P1: activation and DM assistance adoption thresholds met
- P1 -> P2: retention and alert-quality thresholds met
