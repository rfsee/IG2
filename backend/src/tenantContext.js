import { createHttpError } from "./errors.js";

export async function resolveTenantContext(req, services) {
  const actorId = await services.authProvider.resolveActor(req);
  const tenantId = String(req.headers["x-tenant-id"] || "").trim();
  if (!tenantId) {
    throw createHttpError("missing_tenant_id", 400);
  }

  const tenant = await services.repository.getTenantById(tenantId);
  if (!tenant) {
    throw createHttpError("unknown_tenant", 404);
  }

  const membership = await services.repository.findMembership(actorId, tenantId);
  if (!membership) {
    throw createHttpError("tenant_membership_required", 403);
  }

  const requestId = String(req.headers["x-request-id"] || randomRequestId());
  const traceId = String(req.headers["x-trace-id"] || requestId);

  return {
    actorId,
    tenantId,
    role: membership.role,
    requestId,
    traceId,
    parentSpanId: String(req.headers["x-parent-span-id"] || "")
  };
}

function randomRequestId() {
  return `req_${Math.random().toString(36).slice(2, 10)}`;
}
