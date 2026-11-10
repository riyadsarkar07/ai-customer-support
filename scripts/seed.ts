import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, pool } from "../src/lib/db";
import {
  users,
  organizations,
  memberships,
  contacts,
  channelConnections,
  conversations,
  messages,
  knowledgeDocuments,
  workflows,
} from "../src/lib/db/schema";
import { ensureDefaultPlans, provisionOrganization } from "../src/lib/tenant";

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? "SupportPilot123!";

async function upsertUser(params: {
  email: string;
  name: string;
  isPlatformAdmin?: boolean;
}) {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, params.email))
    .limit(1);
  if (existing) return existing;

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const [created] = await db
    .insert(users)
    .values({
      email: params.email,
      name: params.name,
      passwordHash,
      isPlatformAdmin: params.isPlatformAdmin ?? false,
      emailVerified: true,
    })
    .returning();
  return created!;
}

async function main() {
  console.log("Seeding SupportPilot demo data...");
  await ensureDefaultPlans();

  const admin = await upsertUser({
    email: "admin@supportpilot.dev",
    name: "Platform Admin",
    isPlatformAdmin: true,
  });

  const owner = await upsertUser({
    email: "owner@supportpilot.dev",
    name: "Ayesha Rahman",
  });

  const agent = await upsertUser({
    email: "agent@supportpilot.dev",
    name: "Rahim Uddin",
  });

  const [existingOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "demo-store"))
    .limit(1);

  let organizationId = existingOrg?.id;

  if (!organizationId) {
    const result = await provisionOrganization({
      name: "Demo Store",
      ownerId: owner.id,
    });
    organizationId = result.organizationId;

    await db
      .update(organizations)
      .set({
        onboardingCompleted: true,
        website: "https://demo-store.example.com",
        brandColor: "#1d4ed8",
      })
      .where(eq(organizations.id, organizationId));

    await db.insert(memberships).values({
      userId: agent.id,
      organizationId,
      role: "agent",
      status: "active",
    });

    console.log("Created demo workspace.");
  }

  const [channel] = await db
    .select()
    .from(channelConnections)
    .where(eq(channelConnections.organizationId, organizationId))
    .limit(1);

  let channelId = channel?.id;
  if (!channelId) {
    const publicKey = `spk_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    const [created] = await db
      .insert(channelConnections)
      .values({
        organizationId,
        type: "website",
        name: "Demo website",
        status: "connected",
        externalId: publicKey,
        config: { publicKey, widgetEnabled: true, allowedOrigins: "" },
        createdBy: owner.id,
      })
      .returning();
    channelId = created!.id;
  } else if (channel && !channel.externalId) {
    const publicKey = `spk_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
    await db
      .update(channelConnections)
      .set({
        externalId: publicKey,
        config: { ...(channel.config ?? {}), publicKey, widgetEnabled: true },
        updatedAt: new Date(),
      })
      .where(eq(channelConnections.id, channel.id));
  }

  const [existingContact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.organizationId, organizationId))
    .limit(1);

  if (!existingContact) {
    const [contact] = await db
      .insert(contacts)
      .values({
        organizationId,
        name: "Nusrat Jahan",
        email: "nusrat@example.com",
        phone: "+8801700000000",
        locale: "bn",
        tags: ["vip", "demo"],
        notes: "Interested in bulk order pricing.",
        lastSeenAt: new Date(),
      })
      .returning();

    const [conversation] = await db
      .insert(conversations)
      .values({
        organizationId,
        contactId: contact!.id,
        channelConnectionId: channelId!,
        channelType: "website",
        subject: "Bulk order question",
        status: "open",
        priority: "normal",
        aiEnabled: true,
        tags: ["sales"],
        lastMessageAt: new Date(),
        lastMessagePreview: "Hi! Do you offer bulk discounts?",
      })
      .returning();

    await db.insert(messages).values([
      {
        organizationId,
        conversationId: conversation!.id,
        direction: "inbound",
        senderType: "contact",
        body: "Hi! Do you offer bulk discounts?",
        status: "delivered",
      },
      {
        organizationId,
        conversationId: conversation!.id,
        direction: "outbound",
        senderType: "ai",
        body: "Hello! Yes, we offer 10% off for orders above 50 units. Would you like a quote?",
        status: "sent",
      },
    ]);

    console.log("Created demo contact and conversation.");
  }

  const [existingDoc] = await db
    .select()
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.organizationId, organizationId))
    .limit(1);

  if (!existingDoc) {
    await db.insert(knowledgeDocuments).values({
      organizationId,
      title: "Shipping and returns policy",
      sourceType: "text",
      status: "ready",
      charCount: 420,
      chunkCount: 1,
      createdBy: owner.id,
      metadata: {
        text: "We ship nationwide within 2-4 business days. Returns are accepted within 7 days of delivery in original condition. Refunds are processed within 5 business days.",
      },
    });
  }

  const [existingWorkflow] = await db
    .select()
    .from(workflows)
    .where(eq(workflows.organizationId, organizationId))
    .limit(1);

  if (!existingWorkflow) {
    await db.insert(workflows).values({
      organizationId,
      name: "Tag VIP customers",
      description: "Adds a vip tag when a message mentions bulk orders.",
      enabled: true,
      trigger: { type: "message_received", config: {} },
      conditions: [
        { field: "message.body", operator: "contains", value: "bulk" },
      ],
      actions: [{ type: "add_tag", config: { tag: "vip" } }],
      createdBy: owner.id,
    });
  }

  console.log("\nSeed complete.\n");
  console.log("Demo credentials (password for all accounts):", DEMO_PASSWORD);
  console.log("  Platform admin : admin@supportpilot.dev");
  console.log("  Workspace owner: owner@supportpilot.dev");
  console.log("  Agent          : agent@supportpilot.dev");
  console.log("\nPlatform admin id:", admin.id);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
