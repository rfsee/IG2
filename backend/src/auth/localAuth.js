import { createHash, randomBytes } from "node:crypto";
import { createHttpError } from "../errors.js";

const SESSION_TTL_DAYS = Number(process.env.AUTH_SESSION_TTL_DAYS || 14);

export function createLocalAuthProvider(repository) {
  if (
    !repository ||
    typeof repository.createAuthSession !== "function" ||
    typeof repository.resolveAuthSession !== "function" ||
    typeof repository.deleteAuthSession !== "function"
  ) {
    throw createHttpError("local_auth_repository_support_required", 500);
  }

  return {
    kind: "local",
    async resolveActor(req) {
      const token = extractSessionToken(req);
      const session = await repository.resolveAuthSession(hashToken(token));
      if (!session || !session.actorId) {
        throw createHttpError("invalid_token", 401);
      }
      return String(session.actorId || "").trim();
    },
    async issueToken(actorId) {
      const rawToken = `ig2_${randomBytes(24).toString("hex")}`;
      const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await repository.createAuthSession({
        tokenHash: hashToken(rawToken),
        actorId: String(actorId || "").trim(),
        expiresAt
      });
      return rawToken;
    },
    async revokeToken(token) {
      await repository.deleteAuthSession(hashToken(token));
    }
  };
}

function extractSessionToken(req) {
  const cookieToken = readCookie(req?.headers?.cookie, "ig2_session");
  if (cookieToken) {
    return cookieToken;
  }
  const token = String(req?.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    throw createHttpError("missing_bearer_token", 401);
  }
  return token;
}

function readCookie(rawCookieHeader, key) {
  const raw = String(rawCookieHeader || "");
  if (!raw) {
    return "";
  }
  const pairs = raw.split(";").map((item) => item.trim()).filter(Boolean);
  for (const pair of pairs) {
    const [cookieKey, ...rest] = pair.split("=");
    if (String(cookieKey || "").trim() === key) {
      return decodeURIComponent(rest.join("=").trim());
    }
  }
  return "";
}

function hashToken(token) {
  return createHash("sha256").update(String(token || "")).digest("hex");
}
