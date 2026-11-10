import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword, createSession, setActiveOrganization } from "@/lib/auth/session";
import { registerSchema } from "@/lib/validation";
import { provisionOrganization } from "@/lib/tenant";
import { audit } from "@/lib/api/audit";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { rateLimit, rateLimitHeaders } from "@/lib/api/rate-limit";
import { getRequestIp } from "@/lib/api/response";

export async function POST(req: Request) {
  try {
    const ip = getRequestIp(req);
    const rl = rateLimit(`register:${ip}`, 8, 60_000);
    if (!rl.allowed) {
      return jsonError("Too many attempts. Please try again shortly.", 429);
    }

    const body = await req.json().catch(() => null);
    const input = registerSchema.parse(body);

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${input.email}`)
      .limit(1);
    if (existing.length > 0) {
      return jsonError("An account with this email already exists", 409, "email_taken");
    }

    const passwordHash = await hashPassword(input.password);
    const [user] = await db
      .insert(users)
      .values({
        email: input.email,
        name: input.name,
        passwordHash,
        emailVerified: true,
      })
      .returning({ id: users.id, email: users.email, name: users.name });

    if (!user) return jsonError("Failed to create account", 500);

    const { organizationId } = await provisionOrganization({
      name: input.organizationName,
      ownerId: user.id,
      planSlug: input.planSlug,
    });

    await createSession(user.id, organizationId);
    await setActiveOrganization(organizationId);
    await audit({
      organizationId,
      actorId: user.id,
      action: "auth.register",
      resourceType: "organization",
      resourceId: organizationId,
      ipAddress: ip,
    });

    return NextResponse.json(
      {
        user,
        organizationId,
        redirect: "/onboarding",
      },
      { status: 201, headers: rateLimitHeaders(rl) },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}
