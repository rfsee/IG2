import { createDevAuthProvider } from "./devAuth.js";
import { createLocalAuthProvider } from "./localAuth.js";
import { createOidcAuthProvider } from "./oidcAuth.js";

export function createAuthProvider(repository) {
  const provider = String(process.env.AUTH_PROVIDER || "dev").trim().toLowerCase();
  if (provider === "oidc") {
    return createOidcAuthProvider();
  }
  if (provider === "local") {
    return createLocalAuthProvider(repository);
  }
  return createDevAuthProvider();
}
