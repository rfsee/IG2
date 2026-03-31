import { createMemoryRepository } from "./memoryRepository.js";

export async function createRepository() {
  const provider = String(process.env.DATA_PROVIDER || "memory").trim().toLowerCase();
  if (provider === "postgres") {
    const { createPostgresRepository } = await import("./postgresRepository.js");
    return createPostgresRepository();
  }
  return createMemoryRepository();
}
