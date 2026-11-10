"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CHANNEL_LABELS: Record<string, string> = {
  website: "Website",
  telegram: "Telegram",
  facebook: "Messenger",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  gmail: "Gmail",
  outlook: "Outlook",
};

export function DashboardCharts({
  dailyVolume,
  channelBreakdown,
}: {
  dailyVolume: Array<{ day: string; value: number }>;
  channelBreakdown: Array<{ channelType: string; value: number }>;
}) {
  const volume = dailyVolume.map((d) => ({
    day: d.day.slice(5),
    messages: Number(d.value),
  }));

  const channels = channelBreakdown.map((c) => ({
    name: CHANNEL_LABELS[c.channelType] ?? c.channelType,
    conversations: Number(c.value),
  }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Message volume (14 days)</CardTitle>
        </CardHeader>
        <CardContent>
          {volume.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No message data yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={volume}>
                <defs>
                  <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="messages"
                  stroke="#2563eb"
                  strokeWidth={2}
                  fill="url(#vol)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversations by channel</CardTitle>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No conversations yet.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={channels}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="conversations" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
