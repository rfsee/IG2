import { createHttpError } from "./errors.js";

export const ROLE_PERMISSIONS = {
  owner: new Set(["read_posts", "write_posts", "manage_membership", "manage_billing"]),
  manager: new Set(["read_posts", "write_posts"]),
  editor: new Set(["read_posts", "write_posts"]),
  viewer: new Set(["read_posts"])
};

export function hasPermission(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role] && ROLE_PERMISSIONS[role].has(permission));
}

export function requirePermission(context, permission) {
  if (hasPermission(context.role, permission)) {
    return;
  }
  throw createHttpError("forbidden", 403);
}
