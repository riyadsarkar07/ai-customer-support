import { NextResponse } from "next/server";
import { and, eq, isNull, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { invitations, memberships, users, organizations } from "@/lib/db/schema";
import { getAuthContext, hashPassword, createSession, setActiveOrganization } from "@/lib/auth/session";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { emailSchema, passwordSchema } from "@/lib/validation";
import { audit } from "@/lib/api/audit";

const acceptSchema = z.object({
  token: z.string().min(10),
  name: z.string().trim().min(2).max(120).optional(),
  password: passwordSchema.optional(),
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");
    if (!token) return jsonError("Token is required", 400);

    const [row] = await db
      .select({
        invitation: invitations,
        organizationName: organizations.name,
      })
      .from(invitations)
      .innerJoin(
        organizations,
        eq(organizations.id, invitations.organizationId),
      )
      .where(
        and(
          eq(invitations.token, token),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) return jsonError("This invitation is invalid or has expired", 404);

    return NextResponse.json({
      email: row.invitation.email,
      role: row.invitation.role,
      organizationName: row.organizationName,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const input = acceptSchema.parse(await req.json().catch(() => null));

    const [row] = await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.token, input.token),
          isNull(invitations.acceptedAt),
          gt(invitations.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) return jsonError("This invitation is invalid or has expired", 404);

    const auth = await getAuthContext();
    let userId: string;

    if (auth) {
      if (auth.user.email.toLowerCase() !== row.email.toLowerCase()) {
        return jsonError(
          "This invitation was sent to a different email address. Sign in with the invited email.",
          403,
        );
      }
      userId = auth.user.id;
    } else {
      const [existing] = await db
        .select()
        .from(users)
        .where(eq(users.email, row.email))
        .limit(1);

      if (existing) {
        return jsonError(
          "An account with this email already exists. Sign in first, then open the invitation link.",
          409,
          "account_exists",
        );
      }

      if (!input.password || !input.name) {
        return jsonError("Name and password are required to join", 422);
      }

      const [created] = await db
        .insert(users)
        .values({
          email: emailSchema.parse(row.email),
          name: input.name,
          passwordHash: await hashPassword(input.password),
          emailVerified: true,
        })
        .returning({ id: users.id });
      userId = created!.id;
    }

    const [existingMembership] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, row.organizationId),
          eq(memberships.userId, userId),
        ),
      )
      .limit(1);

    if (!existingMembership) {
      await db.insert(memberships).values({
        organizationId: row.organizationId,
        userId,
        role: row.role,
        status: "active",
      });
    }

    await db
      .update(invitations)
      .set({ acceptedAt: new Date() })
      .where(eq(invitations.id, row.id));

    if (!auth) {
      await createSession(userId, row.organizationId);
      await setActiveOrganization(row.organizationId);
    }

    await audit({
      organizationId: row.organizationId,
      actorId: userId,
      action: "team.invitation_accept",
      resourceType: "invitation",
      resourceId: row.id,
    });

    return NextResponse.json({ ok: true, organizationId: row.organizationId });
  } catch (error) {
    return toErrorResponse(error);
  }
}
