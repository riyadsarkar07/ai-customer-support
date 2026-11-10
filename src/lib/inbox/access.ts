import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  conversations,
  contacts,
  channelConnections,
  memberships,
  users,
} from "@/lib/db/schema";
import { NotFoundError } from "@/lib/auth/permissions";

export async function scopedConversation(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Conversation not found");
  return row;
}

export async function scopedContact(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(contacts)
    .where(
      and(eq(contacts.id, id), eq(contacts.organizationId, organizationId)),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Contact not found");
  return row;
}

export async function scopedChannel(organizationId: string, id: string) {
  const [row] = await db
    .select()
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.id, id),
        eq(channelConnections.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Channel not found");
  return row;
}

export async function listAssignableMembers(organizationId: string) {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "active"),
      ),
    );
}
