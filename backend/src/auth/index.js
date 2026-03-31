import { createDevAuthProvider } from "./devAuth.js";
import { createOidcAuthProvider } from "./oidcAuth.js";

export function createAuthProvider() {
  const provider = String(process.env.AUTH_PROVIDER || "dev").trim().toLowerCase();
  if (provider === "oidc") {
    return createOidcAuthProvider();
  }
  return createDevAuthProvider();
}
