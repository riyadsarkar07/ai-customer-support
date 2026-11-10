import { NextResponse } from "next/server";
import { getAuthContext, getWorkspaceContext } from "@/lib/auth/session";
import { toErrorResponse } from "@/lib/api/response";

export async function GET() {
  try {
    const auth = await getAuthContext();
    if (!auth) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }
    const workspace = await getWorkspaceContext();
    return NextResponse.json({
      authenticated: true,
      user: auth.user,
      workspace: workspace
        ? {
            organization: workspace.organization,
            membership: workspace.membership,
            permissions: workspace.permissions,
          }
        : null,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
