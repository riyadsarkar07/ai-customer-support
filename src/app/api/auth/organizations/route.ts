import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { memberships, organizations, sessions } from "@/lib/db/schema";
import { getAuthContext, setActiveOrganization } from "@/lib/auth/session";
import { switchOrgSchema } from "@/lib/validation";
import { jsonError, toErrorResponse } from "@/lib/api/response";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) return jsonError("Authentication required", 401);
    const rows = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        role: memberships.role,
        status: organizations.status,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(
        and(
          eq(memberships.userId, auth.user.id),
          eq(memberships.status, "active"),
        ),
      );
    return NextResponse.json({ organizations: rows, user: auth.user });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    const auth = await getAuthContext();
    if (!auth) return jsonError("Authentication required", 401);

    const body = await req.json().catch(() => null);
    const input = switchOrgSchema.parse(body);

    const rows = await db
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
      .where(
        and(
          eq(memberships.userId, auth.user.id),
          eq(memberships.organizationId, input.organizationId),
          eq(memberships.status, "active"),
          eq(organizations.status, "active"),
        ),
      )
      .limit(1);

    if (!rows[0]) return jsonError("Workspace not found", 404);

    // tokens are session-scoped; update stored session's active org
    const store = await cookies();
    void store;
    await db
      .update(sessions)
      .set({ activeOrganizationId: input.organizationId })
      .where(eq(sessions.userId, auth.user.id));
    await setActiveOrganization(input.organizationId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return toErrorResponse(error);
  }
}
