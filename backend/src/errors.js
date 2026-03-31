export function createHttpError(code, statusCode, message = "") {
  const error = new Error(message || code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

export function normalizeError(error) {
  const statusCode = Number(error?.statusCode || 500);
  const code = String(error?.code || error?.message || "internal_error");
  return {
    statusCode,
    code,
    message: String(error?.message || code),
    retryAfterMs: Number.isFinite(error?.retryAfterMs) ? Number(error.retryAfterMs) : undefined
  };
}
