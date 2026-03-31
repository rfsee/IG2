import { createAuthProvider } from "./auth/index.js";
import { createRepository } from "./repository/index.js";

export async function bootstrapCore() {
  const repository = await createRepository();
  const authProvider = createAuthProvider();
  const health = await repository.healthCheck();

  return {
    repository,
    authProvider,
    health
  };
}
