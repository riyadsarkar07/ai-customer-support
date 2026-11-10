import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Inbox,
  Users,
  Bot,
  Plug,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";
import { getWorkspaceContext } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/analytics";
import { getActiveSubscription, getUsage } from "@/lib/tenant";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button-styles";
import { EmptyState } from "@/components/ui/misc";
import { formatNumber, timeAgo, formatCurrency, cn } from "@/lib/utils";
import { DashboardCharts } from "@/components/dashboard/charts";

export const dynamic = "force-dynamic";

export const metadata = { title: "Dashboard" };

export default async function DashboardHome() {
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/login");

  if (!ctx.organization.onboardingCompleted) {
    redirect("/onboarding");
  }

  const [stats, sub, usage] = await Promise.all([
    getDashboardStats(ctx.organization.id),
    getActiveSubscription(ctx.organization.id),
    getUsage(ctx.organization.id),
  ]);

  const trialDaysLeft = ctx.organization.trialEndsAt
    ? Math.max(
        0,
        Math.ceil(
          (new Date(ctx.organization.trialEndsAt).getTime() - Date.now()) /
            86400_000,
        ),
      )
    : null;

  const statCards: Array<{
    label: string;
    value: string;
    hint: string;
    icon: LucideIcon;
    href: string;
  }> = [
    {
      label: "Open conversations",
      value: formatNumber(stats.openConversations),
      hint: `${stats.pendingConversations} pending`,
      icon: Inbox,
      href: "/dashboard/inbox",
    },
    {
      label: "Contacts",
      value: formatNumber(stats.totalContacts),
      hint: "Across all channels",
      icon: Users,
      href: "/dashboard/contacts",
    },
    {
      label: "AI replies (30d)",
      value: formatNumber(stats.aiReplies),
      hint: `${stats.aiDeflection}% of outbound`,
      icon: Bot,
      href: "/dashboard/ai",
    },
    {
      label: "Channels",
      value: formatNumber(stats.activeChannels),
      hint: "Connected & healthy",
      icon: Plug,
      href: "/dashboard/integrations",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Welcome back, {ctx.user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here is what is happening in {ctx.organization.name} today.
          </p>
        </div>
        <Link href="/dashboard/inbox" className={buttonClasses("default", "default")}>
          Open inbox
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>

      {sub && sub.subscription.status === "trialing" && trialDaysLeft !== null && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm font-semibold">
              You are on a {sub.plan.name} trial - {trialDaysLeft} day
              {trialDaysLeft === 1 ? "" : "s"} left
            </p>
            <p className="text-xs text-muted-foreground">
              Upgrade now to keep your channels, AI replies, and data after the
              trial ends.
            </p>
          </div>
          <Link href="/dashboard/billing" className={buttonClasses("default", "sm")}>
            View plans
          </Link>
        </div>
      )}

      {stats.activeChannels === 0 && (
        <div className="rounded-xl border border-dashed p-4">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="text-sm font-semibold">Connect your first channel</p>
              <p className="text-xs text-muted-foreground">
                Add a website widget or Telegram bot to start receiving
                conversations. More channels are available on paid plans.
              </p>
            </div>
            <Link
              href="/dashboard/integrations"
              className={buttonClasses("outline", "sm")}
            >
              Add channel
            </Link>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} href={s.href}>
              <Card className="transition-shadow hover:shadow-md">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">{s.label}</p>
                    <Icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="mt-2 text-2xl font-bold">{s.value}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{s.hint}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      <DashboardCharts
        dailyVolume={stats.dailyVolume}
        channelBreakdown={stats.channelBreakdown}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent conversations</CardTitle>
            <Link
              href="/dashboard/inbox"
              className="text-sm text-primary hover:underline"
            >
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {stats.recent.length === 0 ? (
              <EmptyState
                icon={<Inbox className="h-8 w-8" />}
                title="No conversations yet"
                description="Once a customer messages you, conversations will appear here."
              />
            ) : (
              <div className="divide-y">
                {stats.recent.map((c) => (
                  <Link
                    key={c.id}
                    href={`/dashboard/inbox?conversation=${c.id}`}
                    className="flex items-center justify-between gap-3 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {c.contactName ?? "Unknown contact"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.lastMessagePreview ?? "No messages"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge
                        variant={
                          c.status === "open"
                            ? "default"
                            : c.status === "pending"
                              ? "warning"
                              : c.status === "resolved"
                                ? "success"
                                : "secondary"
                        }
                      >
                        {c.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {timeAgo(c.lastMessageAt)}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Plan usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {sub ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="font-semibold">{sub.plan.name}</span>
                </div>
                <UsageBar
                  label="AI replies"
                  used={usage["ai_replies"] ?? 0}
                  limit={sub.plan.maxAiReplies}
                />
                <UsageBar
                  label="Conversations"
                  used={stats.openConversations}
                  limit={sub.plan.maxConversations}
                />
                <UsageBar
                  label="Channels"
                  used={stats.activeChannels}
                  limit={sub.plan.maxChannels}
                />
                <div className="flex items-center justify-between border-t pt-3 text-sm">
                  <span className="text-muted-foreground">AI cost (30d)</span>
                  <span className="font-semibold">
                    {formatCurrency(stats.aiCostUsd, "USD")}
                  </span>
                </div>
                <Link
                  href="/dashboard/billing"
                  className={buttonClasses("outline", "sm", "w-full")}
                >
                  Manage subscription
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active subscription. Visit billing to choose a plan.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function UsageBar({
  label,
  used,
  limit,
}: {
  label: string;
  used: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">
          {formatNumber(used)} / {formatNumber(limit)}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full",
            pct > 90 ? "bg-destructive" : pct > 70 ? "bg-amber-500" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
