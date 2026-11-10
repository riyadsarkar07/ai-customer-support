import { getAuthContext, type SessionUser } from "./session";
import { ForbiddenError, UnauthorizedError } from "./permissions";

/**
 * Returns the authenticated platform operator or throws. Platform admin access
 * is verified against the database-backed session on every call, never from a
 * cookie claim.
 */
export async function requirePlatformAdmin(): Promise<SessionUser> {
  const auth = await getAuthContext();
  if (!auth) throw new UnauthorizedError();
  if (!auth.user.isPlatformAdmin) throw new ForbiddenError();
  return auth.user;
}

export async function getPlatformAdmin(): Promise<SessionUser | null> {
  const auth = await getAuthContext();
  if (!auth?.user.isPlatformAdmin) return null;
  return auth.user;
}
