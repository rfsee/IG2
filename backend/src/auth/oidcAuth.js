import { createRemoteJWKSet, jwtVerify } from "jose";
import { createHttpError } from "../errors.js";

export function createOidcAuthProvider() {
  const issuer = String(process.env.OIDC_ISSUER || "").trim();
  if (!issuer) {
    throw createHttpError("OIDC_ISSUER_REQUIRED", 500);
  }

  const audience = String(process.env.OIDC_AUDIENCE || "").trim();
  if (!audience) {
    throw createHttpError("OIDC_AUDIENCE_REQUIRED", 500);
  }

  const jwksUri = String(process.env.OIDC_JWKS_URI || `${issuer.replace(/\/$/, "")}/.well-known/jwks.json`).trim();
  const jwksCacheMaxAgeMs = getEnvNumber("OIDC_JWKS_CACHE_MAX_AGE_MS", 10 * 60 * 1000);
  const jwksCooldownMs = getEnvNumber("OIDC_JWKS_COOLDOWN_MS", 30 * 1000);
  const jwksTimeoutMs = getEnvNumber("OIDC_JWKS_TIMEOUT_MS", 5000);

  const jwks = createRemoteJWKSet(new URL(jwksUri), {
    cacheMaxAge: jwksCacheMaxAgeMs,
    cooldownDuration: jwksCooldownMs,
    timeoutDuration: jwksTimeoutMs
  });

  return {
    kind: "oidc",
    async resolveActor(req) {
      const token = extractBearer(req.headers.authorization || "");
      try {
        const verified = await jwtVerify(token, jwks, {
          issuer,
          audience
        });
        const actorId = String(verified.payload.sub || "").trim();
        if (!actorId) {
          throw createHttpError("oidc_sub_missing", 401);
        }
        return actorId;
      } catch {
        throw createHttpError("invalid_token", 401);
      }
    }
  };
}

function getEnvNumber(key, fallback) {
  const raw = String(process.env[key] || "").trim();
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return value;
}

function extractBearer(rawAuthorization) {
  const token = String(rawAuthorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw createHttpError("missing_bearer_token", 401);
  }
  return token;
}
