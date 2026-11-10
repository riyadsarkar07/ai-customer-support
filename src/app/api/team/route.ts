import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitations, memberships, users } from "@/lib/db/schema";
import { getWorkspaceContext } from "@/lib/auth/session";
import { assertPermission, ValidationError, NotFoundError } from "@/lib/auth/permissions";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { inviteSchema } from "@/lib/validation";
import { enforceAgentLimit } from "@/lib/tenant";
import { randomToken } from "@/lib/crypto";
import { audit, notify } from "@/lib/api/audit";
import { z } from "zod";

export async function GET() {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "team.manage");

    const members = await db
      .select({
        membershipId: memberships.id,
        userId: users.id,
        name: users.name,
        email: users.email,
        role: memberships.role,
        status: memberships.status,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.organizationId, ctx.organization.id));

    const pending = await db
      .select()
      .from(invitations)
      .where(eq(invitations.organizationId, ctx.organization.id));

    return NextResponse.json({ members, invitations: pending });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "team.manage");

    const input = inviteSchema.parse(await req.json().catch(() => null));

    if (input.role === "admin" && ctx.membership.role !== "owner") {
      return jsonError("Only the owner can invite admins", 403);
    }

    await enforceAgentLimit(ctx.organization.id);

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    if (existingUser) {
      const [existingMembership] = await db
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.organizationId, ctx.organization.id),
            eq(memberships.userId, existingUser.id),
          ),
        )
        .limit(1);
      if (existingMembership) {
        throw new ValidationError("This person is already a member of your team");
      }
    }

    const token = randomToken(24);
    const [invite] = await db
      .insert(invitations)
      .values({
        organizationId: ctx.organization.id,
        email: input.email,
        role: input.role,
        token,
        invitedBy: ctx.user.id,
        expiresAt: new Date(Date.now() + 7 * 86400_000),
      })
      .returning();

    await notify({
      organizationId: ctx.organization.id,
      type: "team.invitation",
      title: "Team invitation created",
      body: `${input.email} was invited as ${input.role}.`,
      link: "/dashboard/team",
    });

    await audit({
      organizationId: ctx.organization.id,
      actorId: ctx.user.id,
      action: "team.invite",
      resourceType: "invitation",
      resourceId: invite!.id,
      metadata: { email: input.email, role: input.role },
    });

    return NextResponse.json(
      {
        invitation: {
          id: invite!.id,
          token: invite!.token,
          email: invite!.email,
          role: invite!.role,
          expiresAt: invite!.expiresAt,
        },
        acceptUrl: `/invite/${invite!.token}`,
      },
      { status: 201 },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}

const patchSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["admin", "agent", "viewer"]).optional(),
  remove: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "team.manage");

    const input = patchSchema.parse(await req.json().catch(() => null));

    const [target] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.organizationId, ctx.organization.id),
          eq(memberships.userId, input.userId),
        ),
      )
      .limit(1);

    if (!target) throw new NotFoundError("Team member not found");
    if (target.role === "owner") {
      return jsonError("The workspace owner cannot be modified", 403);
    }
    if (input.role === "admin" && ctx.membership.role !== "owner") {
      return jsonError("Only the owner can grant admin access", 403);
    }

    if (input.remove) {
      await db
        .delete(memberships)
        .where(
          and(
            eq(memberships.organizationId, ctx.organization.id),
            eq(memberships.userId, input.userId),
          ),
        );
      await audit({
        organizationId: ctx.organization.id,
        actorId: ctx.user.id,
        action: "team.remove",
        resourceType: "membership",
        resourceId: target.id,
      });
      return NextResponse.json({ ok: true });
    }

    if (input.role) {
      await db
        .update(memberships)
        .set({ role: input.role })
        .where(eq(memberships.id, target.id));
      await audit({
        organizationId: ctx.organization.id,
        actorId: ctx.user.id,
        action: "team.role_change",
        resourceType: "membership",
        resourceId: target.id,
        metadata: { role: input.role },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) return jsonError("Authentication required", 401);
    assertPermission(ctx.permissions, "team.manage");

    const { searchParams } = new URL(req.url);
    const invitationId = searchParams.get("invitationId");
    if (!invitationId) throw new ValidationError("invitationId is required");

    await db
      .delete(invitations)
      .where(
        and(
          eq(invitations.id, invitationId),
          eq(invitations.organizationId, ctx.organization.id),
        ),
      );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
