"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Bot, Clock, MessagesSquare, TrendingUp, Users } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Spinner } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatNumber } from "@/lib/utils";

type Analytics = {
  range: number;
  conversationsCreated: number;
  conversationsResolved: number;
  resolutionRate: number;
  statusBreakdown: Array<{ status: string; value: number }>;
  channelBreakdown: Array<{ channelType: string; value: number }>;
  dailyVolume: Array<{ day: string; inbound: number; outbound: number; ai: number }>;
  ai: {
    replies: number;
    avgLatencyMs: number;
    avgConfidence: number;
    totalTokens: number;
    costUsd: number;
    deflection: number;
  };
  agents: Array<{ agentId: string; replies: number; name: string }>;
  newContacts: number;
  totalContacts: number;
};

const CHANNEL_LABELS: Record<string, string> = {
  website: "Website",
  telegram: "Telegram",
  facebook: "Messenger",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  gmail: "Gmail",
  outlook: "Outlook",
  email: "Email",
};

const COLORS = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

const RANGES = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
] as const;

export function AnalyticsClient() {
  const [range, setRange] = React.useState<7 | 30 | 90>(30);
  const [data, setData] = React.useState<Analytics | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (r: 7 | 30 | 90) => {
    setLoading(true);
    try {
      const res = await api.get<Analytics>(`/api/analytics?range=${r}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not load analytics",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load(range);
  }, [range, load]);

  if (error) {
    return (
      <Alert variant="error" title="Analytics unavailable">
        {error}
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Analytics</h1>
          <p className="text-sm text-muted-foreground">
            Support performance, AI effectiveness, and channel mix.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border p-1">
          {RANGES.map((r) => (
            <Button
              key={r.value}
              size="sm"
              variant={range === r.value ? "default" : "ghost"}
              onClick={() => setRange(r.value)}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={MessagesSquare}
              label="Conversations"
              value={formatNumber(data.conversationsCreated)}
              hint={`${formatNumber(data.conversationsResolved)} resolved`}
            />
            <StatCard
              icon={TrendingUp}
              label="Resolution rate"
              value={`${data.resolutionRate}%`}
              hint="Of conversations created"
            />
            <StatCard
              icon={Bot}
              label="AI deflection"
              value={`${data.ai.deflection}%`}
              hint={`${formatNumber(data.ai.replies)} AI replies`}
            />
            <StatCard
              icon={Users}
              label="Contacts"
              value={formatNumber(data.totalContacts)}
              hint={`+${formatNumber(data.newContacts)} new`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Message volume</CardTitle>
            </CardHeader>
            <CardContent>
              {data.dailyVolume.length === 0 ? (
                <Empty />
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart
                    data={data.dailyVolume.map((d) => ({
                      day: d.day.slice(5),
                      inbound: Number(d.inbound),
                      outbound: Number(d.outbound),
                      ai: Number(d.ai),
                    }))}
                  >
                    <defs>
                      <linearGradient id="in" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" fontSize={12} />
                    <YAxis fontSize={12} allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="inbound"
                      stroke="#2563eb"
                      fill="url(#in)"
                      name="Inbound"
                    />
                    <Area
                      type="monotone"
                      dataKey="outbound"
                      stroke="#10b981"
                      fill="transparent"
                      name="Outbound"
                    />
                    <Area
                      type="monotone"
                      dataKey="ai"
                      stroke="#8b5cf6"
                      fill="transparent"
                      name="AI"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Channels</CardTitle>
              </CardHeader>
              <CardContent>
                {data.channelBreakdown.length === 0 ? (
                  <Empty />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie
                        data={data.channelBreakdown.map((c) => ({
                          name: CHANNEL_LABELS[c.channelType] ?? c.channelType,
                          value: Number(c.value),
                        }))}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {data.channelBreakdown.map((c, i) => (
                          <Cell key={c.channelType} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status</CardTitle>
              </CardHeader>
              <CardContent>
                {data.statusBreakdown.length === 0 ? (
                  <Empty />
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={data.statusBreakdown.map((s) => ({
                        status: s.status,
                        value: Number(s.value),
                      }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="status" fontSize={12} />
                      <YAxis fontSize={12} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#2563eb" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="AI replies" value={formatNumber(data.ai.replies)} />
                <Row
                  label="Avg. latency"
                  value={`${formatNumber(data.ai.avgLatencyMs)} ms`}
                  icon={Clock}
                />
                <Row
                  label="Avg. confidence"
                  value={`${Math.round(data.ai.avgConfidence * 100)}%`}
                />
                <Row label="Tokens used" value={formatNumber(data.ai.totalTokens)} />
                <Row label="Estimated cost" value={`$${data.ai.costUsd.toFixed(4)}`} />
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Agent replies</CardTitle>
              </CardHeader>
              <CardContent>
                {data.agents.length === 0 ? (
                  <Empty />
                ) : (
                  <Table>
                    <THead>
                      <TR>
                        <TH>Agent</TH>
                        <TH className="text-right">Replies</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.agents.map((a) => (
                        <TR key={a.agentId}>
                          <TD>{a.name}</TD>
                          <TD className="text-right">{formatNumber(a.replies)}</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="mt-2 text-2xl font-semibold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
  icon: Icon,
  hidden,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
      <span className="flex items-center gap-2 text-muted-foreground">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Empty() {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">
      No data in this period.
    </p>
  );
}
