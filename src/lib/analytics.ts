import { and, count, eq, gte, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiUsageLogs,
  channelConnections,
  contacts,
  conversations,
  messages,
} from "@/lib/db/schema";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400_000);
}

export async function getDashboardStats(organizationId: string) {
  const since = daysAgo(30);

  const [openConvs] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.status, "open"),
      ),
    );

  const [pendingConvs] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.status, "pending"),
      ),
    );

  const [resolvedConvs] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.status, "resolved"),
      ),
    );

  const [totalContacts] = await db
    .select({ value: count() })
    .from(contacts)
    .where(eq(contacts.organizationId, organizationId));

  const [activeChannels] = await db
    .select({ value: count() })
    .from(channelConnections)
    .where(
      and(
        eq(channelConnections.organizationId, organizationId),
        eq(channelConnections.status, "connected"),
      ),
    );

  const [aiReplies] = await db
    .select({ value: count() })
    .from(aiUsageLogs)
    .where(
      and(
        eq(aiUsageLogs.organizationId, organizationId),
        gte(aiUsageLogs.createdAt, since),
      ),
    );

  const aiCostRows = await db
    .select({
      total: sql<number>`coalesce(sum(${aiUsageLogs.costUsd}), 0)::float`,
    })
    .from(aiUsageLogs)
    .where(
      and(
        eq(aiUsageLogs.organizationId, organizationId),
        gte(aiUsageLogs.createdAt, since),
      ),
    );

  const channelBreakdown = await db
    .select({
      channelType: conversations.channelType,
      value: count(),
    })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        gte(conversations.createdAt, since),
      ),
    )
    .groupBy(conversations.channelType);

  const dailyVolume = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${messages.createdAt}), 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, organizationId),
        gte(messages.createdAt, daysAgo(14)),
      ),
    )
    .groupBy(sql`date_trunc('day', ${messages.createdAt})`)
    .orderBy(sql`date_trunc('day', ${messages.createdAt})`);

  const recent = await db
    .select({
      id: conversations.id,
      status: conversations.status,
      channelType: conversations.channelType,
      lastMessagePreview: conversations.lastMessagePreview,
      lastMessageAt: conversations.lastMessageAt,
      contactName: contacts.name,
    })
    .from(conversations)
    .innerJoin(contacts, eq(contacts.id, conversations.contactId))
    .where(eq(conversations.organizationId, organizationId))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(6);

  const [aiOutbound] = await db
    .select({ value: count() })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, organizationId),
        eq(messages.senderType, "ai"),
        gte(messages.createdAt, since),
      ),
    );

  const [humanOutbound] = await db
    .select({ value: count() })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, organizationId),
        eq(messages.senderType, "agent"),
        gte(messages.createdAt, since),
      ),
    );

  const ai = Number(aiOutbound?.value ?? 0);
  const human = Number(humanOutbound?.value ?? 0);
  const deflection = ai + human > 0 ? Math.round((ai / (ai + human)) * 100) : 0;

  return {
    openConversations: Number(openConvs?.value ?? 0),
    pendingConversations: Number(pendingConvs?.value ?? 0),
    resolvedConversations: Number(resolvedConvs?.value ?? 0),
    totalContacts: Number(totalContacts?.value ?? 0),
    activeChannels: Number(activeChannels?.value ?? 0),
    aiReplies: Number(aiReplies?.value ?? 0),
    aiCostUsd: Number(aiCostRows[0]?.total ?? 0),
    aiDeflection: deflection,
    channelBreakdown,
    dailyVolume,
    recent,
  };
}

export type AnalyticsRange = 7 | 30 | 90;

function rangeStart(days: AnalyticsRange): Date {
  return daysAgo(days);
}

export async function getAnalytics(
  organizationId: string,
  days: AnalyticsRange = 30,
) {
  const since = rangeStart(days);

  const [created] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        gte(conversations.createdAt, since),
      ),
    );

  const [resolved] = await db
    .select({ value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.status, "resolved"),
        gte(conversations.updatedAt, since),
      ),
    );

  const statusBreakdown = await db
    .select({ status: conversations.status, value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        gte(conversations.createdAt, since),
      ),
    )
    .groupBy(conversations.status);

  const channelBreakdown = await db
    .select({ channelType: conversations.channelType, value: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        gte(conversations.createdAt, since),
      ),
    )
    .groupBy(conversations.channelType);

  const dailyVolume = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${messages.createdAt}), 'YYYY-MM-DD')`,
      inbound: sql<number>`count(*) filter (where ${messages.direction} = 'inbound')::int`,
      outbound: sql<number>`count(*) filter (where ${messages.direction} = 'outbound')::int`,
      ai: sql<number>`count(*) filter (where ${messages.senderType} = 'ai')::int`,
    })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, organizationId),
        gte(messages.createdAt, since),
      ),
    )
    .groupBy(sql`date_trunc('day', ${messages.createdAt})`)
    .orderBy(sql`date_trunc('day', ${messages.createdAt})`);

  const [aiAgg] = await db
    .select({
      replies: count(),
      avgLatency: sql<number>`coalesce(avg(${aiUsageLogs.latencyMs}), 0)::int`,
      avgConfidence: sql<number>`coalesce(avg(${aiUsageLogs.confidence}), 0)::float`,
      totalTokens: sql<number>`coalesce(sum(${aiUsageLogs.totalTokens}), 0)::int`,
      cost: sql<number>`coalesce(sum(${aiUsageLogs.costUsd}), 0)::float`,
    })
    .from(aiUsageLogs)
    .where(
      and(
        eq(aiUsageLogs.organizationId, organizationId),
        gte(aiUsageLogs.createdAt, since),
      ),
    );

  const agentPerformance = await db
    .select({
      agentId: messages.senderId,
      replies: count(),
    })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, organizationId),
        eq(messages.senderType, "agent"),
        gte(messages.createdAt, since),
        sql`${messages.senderId} is not null`,
      ),
    )
    .groupBy(messages.senderId)
    .orderBy(desc(count()))
    .limit(10);

  const [newContacts] = await db
    .select({ value: count() })
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, organizationId),
        gte(contacts.createdAt, since),
      ),
    );

  const [totalContacts] = await db
    .select({ value: count() })
    .from(contacts)
    .where(eq(contacts.organizationId, organizationId));

  const aiReplies = Number(aiAgg?.replies ?? 0);
  const [humanOutbound] = await db
    .select({ value: count() })
    .from(messages)
    .where(
      and(
        eq(messages.organizationId, organizationId),
        eq(messages.senderType, "agent"),
        gte(messages.createdAt, since),
      ),
    );
  const human = Number(humanOutbound?.value ?? 0);
  const deflection = aiReplies + human > 0 ? Math.round((aiReplies / (aiReplies + human)) * 100) : 0;

  const createdCount = Number(created?.value ?? 0);
  const resolvedCount = Number(resolved?.value ?? 0);

  return {
    range: days,
    conversationsCreated: createdCount,
    conversationsResolved: resolvedCount,
    resolutionRate:
      createdCount > 0 ? Math.round((resolvedCount / createdCount) * 100) : 0,
    statusBreakdown,
    channelBreakdown,
    dailyVolume,
    ai: {
      replies: aiReplies,
      avgLatencyMs: Number(aiAgg?.avgLatency ?? 0),
      avgConfidence: Number(aiAgg?.avgConfidence ?? 0),
      totalTokens: Number(aiAgg?.totalTokens ?? 0),
      costUsd: Number(aiAgg?.cost ?? 0),
      deflection,
    },
    agents: agentPerformance.map((a) => ({
      agentId: a.agentId as string,
      replies: Number(a.replies),
    })),
    newContacts: Number(newContacts?.value ?? 0),
    totalContacts: Number(totalContacts?.value ?? 0),
  };
}
