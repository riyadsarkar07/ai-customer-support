import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiSettings,
  channelConnections,
  conversations,
  knowledgeDocuments,
  memberships,
  organizations,
  plans,
  roles,
  subscriptions,
  usageRecords,
} from "@/lib/db/schema";
import { LimitError } from "@/lib/auth/permissions";
import { slugify } from "@/lib/utils";

export const DEFAULT_PLANS = [
  {
    name: "Starter",
    slug: "starter",
    description: "For small businesses getting started with AI support.",
    price: "0",
    trialDays: 14,
    maxAgents: 2,
    maxConversations: 500,
    maxChannels: 1,
    maxKnowledgeMb: 10,
    maxAiReplies: 300,
    features: [
      "1 channel",
      "2 team members",
      "500 conversations / month",
      "300 AI replies / month",
      "10 MB knowledge base",
    ],
    sortOrder: 1,
  },
  {
    name: "Growth",
    slug: "growth",
    description: "For growing teams that need automation and more channels.",
    price: "2990",
    trialDays: 14,
    maxAgents: 8,
    maxConversations: 5000,
    maxChannels: 5,
    maxKnowledgeMb: 200,
    maxAiReplies: 5000,
    features: [
      "5 channels",
      "8 team members",
      "5,000 conversations / month",
      "5,000 AI replies / month",
      "200 MB knowledge base",
      "Workflow automation",
      "Priority support",
    ],
    sortOrder: 2,
  },
  {
    name: "Business",
    slug: "business",
    description: "For established businesses with high support volume.",
    price: "7990",
    trialDays: 14,
    maxAgents: 25,
    maxConversations: 25000,
    maxChannels: 20,
    maxKnowledgeMb: 1000,
    maxAiReplies: 30000,
    features: [
      "Unlimited channels (fair use)",
      "25 team members",
      "25,000 conversations / month",
      "30,000 AI replies / month",
      "1 GB knowledge base",
      "Custom roles",
      "Audit logs",
      "Dedicated support",
    ],
    sortOrder: 3,
  },
];

export const SYSTEM_ROLE_DEFINITIONS = [
  { name: "Owner", role: "owner" as const, permissions: [] },
  { name: "Admin", role: "admin" as const, permissions: [] },
  { name: "Agent", role: "agent" as const, permissions: [] },
  { name: "Viewer", role: "viewer" as const, permissions: [] },
];

export async function ensureDefaultPlans(): Promise<void> {
  const existing = await db.select({ id: plans.id }).from(plans).limit(1);
  if (existing.length > 0) return;
  await db.insert(plans).values(DEFAULT_PLANS);
}

export async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "workspace";
  let candidate = root;
  let n = 1;
  // bounded attempts
  while (n < 50) {
    const found = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, candidate))
      .limit(1);
    if (found.length === 0) return candidate;
    candidate = `${root}-${n}`;
    n += 1;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function provisionOrganization(params: {
  name: string;
  ownerId: string;
  planSlug?: string;
}): Promise<{ organizationId: string }> {
  await ensureDefaultPlans();

  const slug = await uniqueSlug(params.name);
  const trialEndsAt = new Date(Date.now() + 14 * 86400_000);

  const [org] = await db
    .insert(organizations)
    .values({
      name: params.name,
      slug,
      trialEndsAt,
    })
    .returning({ id: organizations.id });

  if (!org) throw new Error("Failed to create organization");

  await db.insert(memberships).values({
    userId: params.ownerId,
    organizationId: org.id,
    role: "owner",
    status: "active",
  });

  await db.insert(roles).values(
    SYSTEM_ROLE_DEFINITIONS.map((r) => ({
      organizationId: org.id,
      name: r.name,
      isSystem: true,
    })),
  );

  await db.insert(aiSettings).values({ organizationId: org.id });

  const plan = await db
    .select()
    .from(plans)
    .where(eq(plans.slug, params.planSlug ?? "starter"))
    .limit(1);

  const selectedPlan =
    plan[0] ??
    (
      await db
        .select()
        .from(plans)
        .where(eq(plans.slug, "starter"))
        .limit(1)
    )[0];

  if (selectedPlan) {
    const periodEnd = new Date(
      Date.now() + (selectedPlan.interval === "yearly" ? 365 : 30) * 86400_000,
    );
    await db.insert(subscriptions).values({
      organizationId: org.id,
      planId: selectedPlan.id,
      status: "trialing",
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
    });
  }

  return { organizationId: org.id };
}

export async function getActiveSubscription(organizationId: string) {
  const rows = await db
    .select({
      subscription: subscriptions,
      plan: plans,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);
  return rows[0] ?? null;
}

function periodStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function getUsage(organizationId: string) {
  const start = periodStart();
  const rows = await db
    .select({
      metric: usageRecords.metric,
      total: sql<number>`coalesce(sum(${usageRecords.quantity}), 0)::int`,
    })
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.organizationId, organizationId),
        gte(usageRecords.periodStart, start),
      ),
    )
    .groupBy(usageRecords.metric);

  const map: Record<string, number> = {};
  for (const r of rows) map[r.metric] = r.total;
  return map;
}

export async function recordUsage(
  organizationId: string,
  metric: string,
  quantity = 1,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.insert(usageRecords).values({
    organizationId,
    metric,
    quantity,
    periodStart: periodStart(),
    metadata,
  });
}

export async function getPlanLimits(organizationId: string) {
  const active = await getActiveSubscription(organizationId);
  if (!active) return null;
  return { plan: active.plan, subscription: active.subscription };
}

export async function enforceChannelLimit(organizationId: string): Promise<void> {
  const limits = await getPlanLimits(organizationId);
  if (!limits) return;
  const [row] = await db
    .select({ value: count() })
    .from(channelConnections)
    .where(eq(channelConnections.organizationId, organizationId));
  if (Number(row?.value ?? 0) >= limits.plan.maxChannels) {
    throw new LimitError(
      "channel_limit_reached",
      `Your ${limits.plan.name} plan allows ${limits.plan.maxChannels} channel(s). Upgrade to add more.`,
    );
  }
}

export async function enforceAgentLimit(organizationId: string): Promise<void> {
  const limits = await getPlanLimits(organizationId);
  if (!limits) return;
  const [row] = await db
    .select({ value: count() })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        eq(memberships.status, "active"),
      ),
    );
  if (Number(row?.value ?? 0) >= limits.plan.maxAgents) {
    throw new LimitError(
      "agent_limit_reached",
      `Your ${limits.plan.name} plan allows ${limits.plan.maxAgents} team member(s). Upgrade to invite more.`,
    );
  }
}

export async function enforceKnowledgeLimit(
  organizationId: string,
  incomingBytes: number,
): Promise<void> {
  const limits = await getPlanLimits(organizationId);
  if (!limits) return;
  const rows = await db
    .select({ size: knowledgeDocuments.sizeBytes })
    .from(knowledgeDocuments)
    .where(eq(knowledgeDocuments.organizationId, organizationId));
  const used = rows.reduce((acc, r) => acc + Number(r.size ?? 0), 0);
  const maxBytes = limits.plan.maxKnowledgeMb * 1024 * 1024;
  if (used + incomingBytes > maxBytes) {
    throw new LimitError(
      "knowledge_limit_reached",
      `Your ${limits.plan.name} plan allows ${limits.plan.maxKnowledgeMb} MB of knowledge storage. Upgrade or remove documents.`,
    );
  }
}

export async function enforceConversationLimit(
  organizationId: string,
): Promise<void> {
  const limits = await getPlanLimits(organizationId);
  if (!limits) return;
  const start = periodStart();
  const [row] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        gte(conversations.createdAt, start),
      ),
    );
  if (Number(row?.value ?? 0) >= limits.plan.maxConversations) {
    throw new LimitError(
      "conversation_limit_reached",
      `Your ${limits.plan.name} plan allows ${limits.plan.maxConversations} conversations per month. Upgrade to continue.`,
    );
  }
}

export async function enforceAiLimit(organizationId: string): Promise<void> {
  const limits = await getPlanLimits(organizationId);
  if (!limits) return;
  const usage = await getUsage(organizationId);
  const used = usage["ai_replies"] ?? 0;
  if (used >= limits.plan.maxAiReplies) {
    throw new LimitError(
      "ai_limit_reached",
      `Your ${limits.plan.name} plan allows ${limits.plan.maxAiReplies} AI replies per month. Upgrade to continue using AI.`,
    );
  }
}
