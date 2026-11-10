import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import bcrypt from "bcryptjs";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions, users, memberships, organizations, roles } from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  PERMISSIONS,
  permissionsForRole,
  type Permission,
  type Role,
} from "./permissions";

const COOKIE_NAME = "sp_session";
const SESSION_DAYS = 30;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.SESSION_SECRET);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSession(
  userId: string,
  organizationId?: string | null,
): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.insert(sessions).values({
    userId,
    tokenHash,
    activeOrganizationId: organizationId ?? null,
    expiresAt,
  });
  const jwt = await new SignJWT({ sid: tokenHash })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return jwt;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, secretKey());
      if (typeof payload.sid === "string") {
        await db.delete(sessions).where(eq(sessions.tokenHash, payload.sid));
      }
    } catch {
      // ignore invalid session cookies
    }
  }
  store.delete(COOKIE_NAME);
}

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  isPlatformAdmin: boolean;
};

export type AuthContext = {
  user: SessionUser;
  sessionId: string;
};

export async function getAuthContext(): Promise<AuthContext | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  let sid: string;
  let sub: string;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.sid !== "string" || typeof payload.sub !== "string") {
      return null;
    }
    sid = payload.sid;
    sub = payload.sub;
  } catch {
    return null;
  }

  const rows = await db
    .select({
      user: users,
      session: sessions,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sid), gt(sessions.expiresAt, new Date())))
    .limit(1);

  const row = rows[0];
  if (!row || row.user.id !== sub) return null;

  return {
    user: {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      isPlatformAdmin: row.user.isPlatformAdmin,
    },
    sessionId: row.session.id,
  };
}

export type WorkspaceContext = {
  user: SessionUser;
  organization: {
    id: string;
    name: string;
    slug: string;
    status: string;
    currency: string;
    timezone: string;
    locale: string;
    website: string | null;
    logoUrl: string | null;
    brandColor: string;
    onboardingCompleted: boolean;
    trialEndsAt: Date | null;
  };
  membership: {
    id: string;
    role: Role;
    roleId: string | null;
  };
  permissions: Permission[];
};

export async function getWorkspaceContext(
  organizationId?: string,
): Promise<WorkspaceContext | null> {
  const auth = await getAuthContext();
  if (!auth) return null;

  let targetOrgId = organizationId;
  if (!targetOrgId) {
    const store = await cookies();
    const activeOrg = store.get("sp_org")?.value;
    if (activeOrg) targetOrgId = activeOrg;
  }

  if (targetOrgId) {
    const ctx = await loadMembership(auth, targetOrgId);
    if (ctx) return ctx;
  }

  const rows = await db
    .select({ organizationId: memberships.organizationId })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, auth.user.id),
        eq(memberships.status, "active"),
      ),
    )
    .limit(1);

  if (!rows[0]) return null;
  return loadMembership(auth, rows[0].organizationId);
}

async function loadMembership(
  auth: AuthContext,
  organizationId: string,
): Promise<WorkspaceContext | null> {
  const rows = await db
    .select({
      organization: organizations,
      membership: memberships,
      role: roles,
    })
    .from(memberships)
    .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
    .leftJoin(roles, eq(roles.id, memberships.roleId))
    .where(
      and(
        eq(memberships.userId, auth.user.id),
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "active"),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  if (
    row.organization.status === "suspended" ||
    row.organization.status === "deleted"
  ) {
    return null;
  }

  const perms =
    row.role && row.role.permissions.length > 0
      ? permissionsForRole(row.membership.role, row.role.permissions)
      : permissionsForRole(row.membership.role);

  return {
    user: auth.user,
    organization: {
      id: row.organization.id,
      name: row.organization.name,
      slug: row.organization.slug,
      status: row.organization.status,
      currency: row.organization.currency,
      timezone: row.organization.timezone,
      locale: row.organization.locale,
      website: row.organization.website,
      logoUrl: row.organization.logoUrl,
      brandColor: row.organization.brandColor,
      onboardingCompleted: row.organization.onboardingCompleted,
      trialEndsAt: row.organization.trialEndsAt,
    },
    membership: {
      id: row.membership.id,
      role: row.membership.role,
      roleId: row.membership.roleId,
    },
    permissions: perms,
  };
}

export async function requireWorkspace(): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) {
    const { UnauthorizedError } = await import("./permissions");
    throw new UnauthorizedError();
  }
  return ctx;
}

export async function setActiveOrganization(orgId: string): Promise<void> {
  const store = await cookies();
  store.set("sp_org", orgId, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 30 * 86400,
  });
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
