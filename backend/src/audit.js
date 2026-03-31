import { randomUUID } from "node:crypto";

export async function writeAudit(repository, context, action, resourceType, resourceId, metadata = {}, sourceIp = "") {
  const envelope = {
    eventVersion: "1.0",
    emittedAt: new Date().toISOString(),
    traceId: context.traceId || context.requestId,
    spanId: randomUUID(),
    parentSpanId: context.parentSpanId || undefined
  };

  await repository.appendAuditEvent({
    tenantId: context.tenantId,
    actorId: context.actorId,
    actorRole: context.role,
    action,
    resourceType,
    resourceId,
    requestId: context.requestId,
    sourceIp,
    metadata: {
      ...metadata,
      event: envelope
    }
  });
}
