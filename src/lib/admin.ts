import { and, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  aiUsageLogs,
  auditLogs,
  conversations,
  memberships,
  messages,
  organizations,
  payments,
  plans,
  subscriptions,
  users,
} from "@/lib/db/schema";

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400_000);
}

export async function getPlatformOverview() {
  const since30 = daysAgo(30);

  const [orgs] = await db
    .select({
      total: count(),
      active: sql<number>`count(*) filter (where ${organizations.status} = 'active')::int`,
      suspended: sql<number>`count(*) filter (where ${organizations.status} = 'suspended')::int`,
      newThisMonth: sql<number>`count(*) filter (where ${organizations.createdAt} >= ${since30})::int`,
    })
    .from(organizations);

  const [userAgg] = await db
    .select({
      total: count(),
      newThisMonth: sql<number>`count(*) filter (where ${users.createdAt} >= ${since30})::int`,
      admins: sql<number>`count(*) filter (where ${users.isPlatformAdmin} = true)::int`,
    })
    .from(users);

  const [convAgg] = await db
    .select({
      total: count(),
      last30: sql<number>`count(*) filter (where ${conversations.createdAt} >= ${since30})::int`,
      open: sql<number>`count(*) filter (where ${conversations.status} = 'open')::int`,
    })
    .from(conversations);

  const [msgAgg] = await db
    .select({
      total: count(),
      last30: sql<number>`count(*) filter (where ${messages.createdAt} >= ${since30})::int`,
    })
    .from(messages);

  const [paymentAgg] = await db
    .select({
      completed: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'completed'), 0)::float`,
      completedCount: sql<number>`count(*) filter (where ${payments.status} = 'completed')::int`,
      pendingCount: sql<number>`count(*) filter (where ${payments.status} = 'pending')::int`,
      last30: sql<number>`coalesce(sum(${payments.amount}) filter (where ${payments.status} = 'completed' and ${payments.paidAt} >= ${since30}), 0)::float`,
    })
    .from(payments);

  const [aiAgg] = await db
    .select({
      replies: count(),
      cost: sql<number>`coalesce(sum(${aiUsageLogs.costUsd}), 0)::float`,
      last30: sql<number>`count(*) filter (where ${aiUsageLogs.createdAt} >= ${since30})::int`,
    })
    .from(aiUsageLogs);

  const planDistribution = await db
    .select({
      planName: plans.name,
      planSlug: plans.slug,
      orgs: count(subscriptions.id),
    })
    .from(plans)
    .leftJoin(subscriptions, eq(subscriptions.planId, plans.id))
    .groupBy(plans.id, plans.name, plans.slug)
    .orderBy(plans.sortOrder);

  const signupTrend = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${organizations.createdAt}), 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(organizations)
    .where(gte(organizations.createdAt, daysAgo(30)))
    .groupBy(sql`date_trunc('day', ${organizations.createdAt})`)
    .orderBy(sql`date_trunc('day', ${organizations.createdAt})`);

  const recentOrgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      status: organizations.status,
      createdAt: organizations.createdAt,
      planName: plans.name,
      memberCount: sql<number>`(
        select count(*)::int from ${memberships}
        where ${memberships.organizationId} = ${organizations.id}
          and ${memberships.status} = 'active'
      )`,
    })
    .from(organizations)
    .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .orderBy(desc(organizations.createdAt))
    .limit(10);

  return {
    organizations: {
      total: Number(orgs?.total ?? 0),
      active: Number(orgs?.active ?? 0),
      suspended: Number(orgs?.suspended ?? 0),
      newThisMonth: Number(orgs?.newThisMonth ?? 0),
    },
    users: {
      total: Number(userAgg?.total ?? 0),
      newThisMonth: Number(userAgg?.newThisMonth ?? 0),
      admins: Number(userAgg?.admins ?? 0),
    },
    conversations: {
      total: Number(convAgg?.total ?? 0),
      last30: Number(convAgg?.last30 ?? 0),
      open: Number(convAgg?.open ?? 0),
    },
    messages: {
      total: Number(msgAgg?.total ?? 0),
      last30: Number(msgAgg?.last30 ?? 0),
    },
    revenue: {
      total: Number(paymentAgg?.completed ?? 0),
      last30: Number(paymentAgg?.last30 ?? 0),
      completedCount: Number(paymentAgg?.completedCount ?? 0),
      pendingCount: Number(paymentAgg?.pendingCount ?? 0),
    },
    ai: {
      replies: Number(aiAgg?.replies ?? 0),
      costUsd: Number(aiAgg?.cost ?? 0),
      last30: Number(aiAgg?.last30 ?? 0),
    },
    planDistribution: planDistribution.map((p) => ({
      ...p,
      orgs: Number(p.orgs),
    })),
    signupTrend: signupTrend.map((s) => ({ day: s.day, value: Number(s.value) })),
    recentOrgs,
  };
}

export async function listTenants(params: {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 20));
  const offset = (page - 1) * pageSize;

  const filters = [];
  if (params.search) {
    const q = `%${params.search}%`;
    filters.push(or(ilike(organizations.name, q), ilike(organizations.slug, q)));
  }
  if (
    params.status &&
    (["active", "suspended", "deleted"] as string[]).includes(params.status)
  ) {
    filters.push(
      eq(
        organizations.status,
        params.status as "active" | "suspended" | "deleted",
      ),
    );
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [total] = await db
    .select({ value: count() })
    .from(organizations)
    .where(where);

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      status: organizations.status,
      website: organizations.website,
      createdAt: organizations.createdAt,
      trialEndsAt: organizations.trialEndsAt,
      planName: plans.name,
      planSlug: plans.slug,
      subscriptionStatus: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      memberCount: sql<number>`(
        select count(*)::int from ${memberships}
        where ${memberships.organizationId} = ${organizations.id}
          and ${memberships.status} = 'active'
      )`,
      conversationCount: sql<number>`(
        select count(*)::int from ${conversations}
        where ${conversations.organizationId} = ${organizations.id}
      )`,
    })
    .from(organizations)
    .leftJoin(subscriptions, eq(subscriptions.organizationId, organizations.id))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(where)
    .orderBy(desc(organizations.createdAt))
    .limit(pageSize)
    .offset(offset);

  return {
    tenants: rows,
    total: Number(total?.value ?? 0),
    page,
    pageSize,
    pages: Math.ceil(Number(total?.value ?? 0) / pageSize),
  };
}

export async function getTenantDetail(organizationId: string) {
  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) return null;

  const [sub] = await db
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.organizationId, organizationId))
    .limit(1);

  const memberRows = await db
    .select({
      id: memberships.id,
      role: memberships.role,
      status: memberships.status,
      createdAt: memberships.createdAt,
      userId: users.id,
      name: users.name,
      email: users.email,
      lastLoginAt: users.lastLoginAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.organizationId, organizationId))
    .orderBy(memberships.createdAt);

  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.organizationId, organizationId))
    .orderBy(desc(payments.createdAt))
    .limit(20);

  const [counts] = await db
    .select({
      conversations: sql<number>`(
        select count(*)::int from ${conversations}
        where ${conversations.organizationId} = ${organizationId}
      )`,
      messages: sql<number>`(
        select count(*)::int from ${messages}
        where ${messages.organizationId} = ${organizationId}
      )`,
    })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  return {
    organization: org,
    subscription: sub?.subscription ?? null,
    plan: sub?.plan ?? null,
    members: memberRows,
    payments: paymentRows,
    counts: {
      conversations: Number(counts?.conversations ?? 0),
      messages: Number(counts?.messages ?? 0),
    },
  };
}

export async function listAllPayments(params: {
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 25));
  const where =
    params.status && params.status !== "all"
      ? eq(payments.status, params.status as "pending" | "completed" | "failed" | "refunded")
      : undefined;

  const [total] = await db.select({ value: count() }).from(payments).where(where);

  const rows = await db
    .select({
      id: payments.id,
      provider: payments.provider,
      amount: payments.amount,
      currency: payments.currency,
      status: payments.status,
      invoiceNumber: payments.invoiceNumber,
      paidAt: payments.paidAt,
      createdAt: payments.createdAt,
      organizationId: payments.organizationId,
      organizationName: organizations.name,
      metadata: payments.metadata,
    })
    .from(payments)
    .innerJoin(organizations, eq(organizations.id, payments.organizationId))
    .where(where)
    .orderBy(desc(payments.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    payments: rows,
    total: Number(total?.value ?? 0),
    page,
    pageSize,
  };
}

export async function listAuditLogs(params: {
  organizationId?: string;
  action?: string;
  page?: number;
  pageSize?: number;
}) {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, params.pageSize ?? 30));

  const filters = [];
  if (params.organizationId) {
    filters.push(eq(auditLogs.organizationId, params.organizationId));
  }
  if (params.action) {
    filters.push(ilike(auditLogs.action, `%${params.action}%`));
  }
  const where = filters.length > 0 ? and(...filters) : undefined;

  const [total] = await db
    .select({ value: count() })
    .from(auditLogs)
    .where(where);

  const rows = await db
    .select({
      id: auditLogs.id,
      action: auditLogs.action,
      resourceType: auditLogs.resourceType,
      resourceId: auditLogs.resourceId,
      metadata: auditLogs.metadata,
      ipAddress: auditLogs.ipAddress,
      createdAt: auditLogs.createdAt,
      organizationId: auditLogs.organizationId,
      organizationName: organizations.name,
      actorId: auditLogs.actorId,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditLogs)
    .leftJoin(organizations, eq(organizations.id, auditLogs.organizationId))
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(where)
    .orderBy(desc(auditLogs.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    logs: rows,
    total: Number(total?.value ?? 0),
    page,
    pageSize,
  };
}
