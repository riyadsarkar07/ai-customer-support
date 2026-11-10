import type { memberRoles } from "@/lib/db/schema";

export type Role = (typeof memberRoles)[number];

export const PERMISSIONS = [
  "org.manage",
  "billing.manage",
  "team.manage",
  "channel.manage",
  "contact.view",
  "contact.manage",
  "conversation.view",
  "conversation.manage",
  "knowledge.manage",
  "ai.manage",
  "workflow.manage",
  "analytics.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [...PERMISSIONS],
  admin: [
    "org.manage",
    "team.manage",
    "channel.manage",
    "contact.view",
    "contact.manage",
    "conversation.view",
    "conversation.manage",
    "knowledge.manage",
    "ai.manage",
    "workflow.manage",
    "analytics.view",
  ],
  agent: [
    "contact.view",
    "contact.manage",
    "conversation.view",
    "conversation.manage",
    "knowledge.manage",
    "analytics.view",
  ],
  viewer: ["contact.view", "conversation.view", "analytics.view"],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsForRole(
  role: Role,
  custom?: string[] | null,
): Permission[] {
  if (custom && custom.length > 0) {
    return custom.filter((p): p is Permission =>
      (PERMISSIONS as readonly string[]).includes(p),
    );
  }
  return ROLE_PERMISSIONS[role] ?? [];
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "You do not have permission to perform this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = "Authentication required") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends Error {
  status = 404;
  constructor(message = "Resource not found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  status = 422;
  details?: unknown;
  constructor(message = "Validation failed", details?: unknown) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

export class LimitError extends Error {
  status = 402;
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LimitError";
    this.code = code;
  }
}

export function assertPermission(
  permissions: Permission[],
  permission: Permission,
): void {
  if (!permissions.includes(permission)) {
    throw new ForbiddenError();
  }
}
