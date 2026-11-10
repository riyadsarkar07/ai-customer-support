import { NextResponse } from "next/server";
import { sql, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, memberships, organizations, sessions } from "@/lib/db/schema";
import { createSession, setActiveOrganization, verifyPassword } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validation";
import { audit } from "@/lib/api/audit";
import { jsonError, toErrorResponse, getRequestIp } from "@/lib/api/response";
import { rateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req);
    const rl = rateLimit(`login:${ip}`, 12, 60_000);
    if (!rl.allowed) {
      return jsonError("Too many login attempts. Please wait a minute.", 429);
    }

    const body = await req.json().catch(() => null);
    const input = loginSchema.parse(body);

    const rows = await db
      .select()
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);
    const user = rows[0];

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return jsonError("Invalid email or password", 401, "invalid_credentials");
    }

    const memberRows = await db
      .select({
        organizationId: memberships.organizationId,
        status: organizations.status,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(eq(memberships.userId, user.id))
      .limit(1);

    const activeOrg =
      memberRows[0] && memberRows[0].status === "active"
        ? memberRows[0].organizationId
        : null;

    await createSession(user.id, activeOrg);
    if (activeOrg) await setActiveOrganization(activeOrg);

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    await audit({
      organizationId: activeOrg,
      actorId: user.id,
      action: "auth.login",
      resourceType: "user",
      resourceId: user.id,
      ipAddress: ip,
      userAgent: req.headers.get("user-agent") ?? undefined,
    });

    const redirect = user.isPlatformAdmin
      ? "/admin"
      : activeOrg
        ? "/dashboard"
        : "/onboarding";

    return NextResponse.json(
      {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          isPlatformAdmin: user.isPlatformAdmin,
        },
        redirect,
      },
      { headers: rateLimitHeaders(rl) },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
