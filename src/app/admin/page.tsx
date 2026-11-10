import { redirect } from "next/navigation";
import {
  Building2,
  CreditCard,
  MessagesSquare,
  Bot,
  Users,
  TrendingUp,
} from "lucide-react";
import { getPlatformAdmin } from "@/lib/auth/platform";
import { getPlatformOverview } from "@/lib/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview - Super Admin" };

export default async function AdminOverviewPage() {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/login");

  const data = await getPlatformOverview();

  const cards = [
    {
      label: "Workspaces",
      value: formatNumber(data.organizations.total),
      hint: `${data.organizations.active} active · ${data.organizations.suspended} suspended`,
      icon: Building2,
    },
    {
      label: "Users",
      value: formatNumber(data.users.total),
      hint: `+${data.users.newThisMonth} this month`,
      icon: Users,
    },
    {
      label: "Conversations",
      value: formatNumber(data.conversations.total),
      hint: `${formatNumber(data.conversations.last30)} in 30 days`,
      icon: MessagesSquare,
    },
    {
      label: "Revenue",
      value: formatCurrency(data.revenue.total, "BDT"),
      hint: `${formatCurrency(data.revenue.last30, "BDT")} last 30 days`,
      icon: CreditCard,
    },
    {
      label: "AI replies",
      value: formatNumber(data.ai.replies),
      hint: `$${data.ai.costUsd.toFixed(2)} estimated cost`,
      icon: Bot,
    },
    {
      label: "Messages",
      value: formatNumber(data.messages.total),
      hint: `${formatNumber(data.messages.last30)} in 30 days`,
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Platform overview</h1>
        <p className="text-sm text-muted-foreground">
          Cross-tenant health, revenue, and AI usage.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {c.label}
                  </p>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-2xl font-semibold">{c.value}</p>
                <p className="text-xs text-muted-foreground">{c.hint}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Plan distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Plan</TH>
                  <TH className="text-right">Workspaces</TH>
                </TR>
              </THead>
              <TBody>
                {data.planDistribution.map((p) => (
                  <TR key={p.planSlug}>
                    <TD>{p.planName}</TD>
                    <TD className="text-right">{formatNumber(p.orgs)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent signups</CardTitle>
          </CardHeader>
          <CardContent>
            {data.signupTrend.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No signups in the last 30 days.
              </p>
            ) : (
              <div className="flex h-[180px] items-end gap-1">
                {data.signupTrend.map((s) => {
                  const max = Math.max(...data.signupTrend.map((x) => x.value), 1);
                  return (
                    <div
                      key={s.day}
                      className="flex flex-1 flex-col items-center gap-1"
                      title={`${s.day}: ${s.value}`}
                    >
                      <div
                        className="w-full rounded-t bg-primary/80"
                        style={{ height: `${(s.value / max) * 140}px` }}
                      />
                      <span className="text-[9px] text-muted-foreground">
                        {s.day.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Newest workspaces</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentOrgs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No workspaces yet.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Workspace</TH>
                  <TH>Plan</TH>
                  <TH>Members</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                </TR>
              </THead>
              <TBody>
                {data.recentOrgs.map((o) => (
                  <TR key={o.id}>
                    <TD>
                      <a
                        href={`/admin/tenants/${o.id}`}
                        className="font-medium hover:underline"
                      >
                        {o.name}
                      </a>
                      <p className="text-xs text-muted-foreground">{o.slug}</p>
                    </TD>
                    <TD>{o.planName ?? "No plan"}</TD>
                    <TD>{o.memberCount}</TD>
                    <TD>
                      <Badge
                        variant={o.status === "active" ? "success" : "warning"}
                      >
                        {o.status}
                      </Badge>
                    </TD>
                    <TD className="text-muted-foreground">
                      {formatDate(o.createdAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
