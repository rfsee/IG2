import { createHttpError } from "./errors.js";

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000);
const READ_LIMIT = Number(process.env.RATE_LIMIT_READ_PER_WINDOW || 120);
const WRITE_LIMIT = Number(process.env.RATE_LIMIT_WRITE_PER_WINDOW || 30);

const bucketMap = new Map();

export function enforceRateLimit(context, actionKey) {
  const now = Date.now();
  const limit = actionKey === "write" ? WRITE_LIMIT : READ_LIMIT;
  const key = `${context.tenantId}:${context.actorId}:${actionKey}`;
  const bucket = bucketMap.get(key);

  if (!bucket || now >= bucket.resetAt) {
    bucketMap.set(key, {
      count: 1,
      resetAt: now + WINDOW_MS
    });
    return;
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    const err = createHttpError("rate_limited", 429);
    err.retryAfterMs = Math.max(0, bucket.resetAt - now);
    throw err;
  }
}
