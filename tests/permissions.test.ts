import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  permissionsForRole,
  roleHasPermission,
} from "@/lib/auth/permissions";

describe("RBAC", () => {
  it("grants every permission to owners", () => {
    for (const permission of PERMISSIONS) {
      expect(roleHasPermission("owner", permission)).toBe(true);
    }
  });

  it("does not grant billing to admins or agents", () => {
    expect(roleHasPermission("admin", "billing.manage")).toBe(false);
    expect(roleHasPermission("agent", "billing.manage")).toBe(false);
    expect(roleHasPermission("owner", "billing.manage")).toBe(true);
  });

  it("limits viewers to read-only permissions", () => {
    const viewer = ROLE_PERMISSIONS.viewer;
    expect(viewer).toEqual(["contact.view", "conversation.view", "analytics.view"]);
    expect(viewer).not.toContain("conversation.manage");
    expect(viewer).not.toContain("org.manage");
  });

  it("filters custom role permissions to known values", () => {
    const result = permissionsForRole("agent", [
      "billing.manage",
      "not-a-real-permission",
      "conversation.view",
    ]);
    expect(result).toEqual(["billing.manage", "conversation.view"]);
  });

  it("falls back to the role definition when custom permissions are empty", () => {
    expect(permissionsForRole("viewer", [])).toEqual(ROLE_PERMISSIONS.viewer);
    expect(permissionsForRole("viewer", null)).toEqual(ROLE_PERMISSIONS.viewer);
  });
});
