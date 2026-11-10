import { db } from "@/lib/db";
import { auditLogs, notifications } from "@/lib/db/schema";

export async function audit(params: {
  organizationId?: string | null;
  actorId?: string | null;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      organizationId: params.organizationId ?? null,
      actorId: params.actorId ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId,
      metadata: params.metadata ?? {},
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
    });
  } catch {
    // audit failures must never break the request path
  }
}

export async function notify(params: {
  organizationId: string;
  userId?: string | null;
  type: string;
  title: string;
  body?: string;
  link?: string;
}): Promise<void> {
  try {
    await db.insert(notifications).values({
      organizationId: params.organizationId,
      userId: params.userId ?? null,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link,
    });
  } catch {
    // best effort
  }
}
