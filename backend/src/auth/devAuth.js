import { createHttpError } from "../errors.js";

export function createDevAuthProvider() {
  return {
    kind: "dev",
    async resolveActor(req) {
      const raw = req.headers.authorization || "";
      const token = String(raw).replace(/^Bearer\s+/i, "").trim();
      if (!token) {
        throw createHttpError("missing_bearer_token", 401);
      }
      if (!token.startsWith("dev_user_")) {
        throw createHttpError("invalid_token", 401);
      }
      return token.replace("dev_user_", "");
    }
  };
}
