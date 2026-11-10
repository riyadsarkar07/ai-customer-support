"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  CreditCard,
  ExternalLink,
  Loader2,
  Receipt,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, Spinner } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toaster";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  currency: string;
  interval: string;
  maxAgents: number;
  maxConversations: number;
  maxChannels: number;
  maxKnowledgeMb: number;
  maxAiReplies: number;
  features: string[];
};

type Subscription = {
  id: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

type Payment = {
  id: string;
  provider: string;
  amount: string;
  currency: string;
  status: string;
  invoiceNumber: string;
  paidAt: string | null;
  createdAt: string;
};

type Provider = { id: string; label: string; configured: boolean };

type BillingData = {
  plans: Plan[];
  subscription: Subscription | null;
  currentPlan: Plan | null;
  usage: Record<string, number>;
  payments: Payment[];
  providers: Provider[];
  sandbox: boolean;
};

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "outline"> = {
  completed: "success",
  pending: "warning",
  failed: "destructive",
  refunded: "outline",
};

const SUB_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "destructive" | "outline"> = {
  active: "success",
  trialing: "warning",
  past_due: "destructive",
  cancelled: "outline",
  expired: "outline",
};

function usageLabel(metric: string): string {
  const map: Record<string, string> = {
    conversations: "Conversations",
    ai_replies: "AI replies",
    messages: "Messages",
    knowledge_mb: "Knowledge storage",
    revenue: "Revenue",
  };
  return map[metric] ?? metric;
}

export function BillingClient() {
  const search = useSearchParams();
  const [data, setData] = React.useState<BillingData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = React.useState("sslcommerz");
  const [busyPlan, setBusyPlan] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState(false);
  const toast = useToast();

  const load = React.useCallback(async () => {
    try {
      const res = await api.get<BillingData>("/api/billing");
      setData(res);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not load billing",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    const status = search.get("payment_status");
    if (!status) return;
    if (status === "success") {
      toast.toast({
        title: "Payment successful",
        description: "Your plan is now active.",
        variant: "success",
      });
    } else if (status === "cancel") {
      toast.toast({ title: "Payment cancelled" });
    } else {
      toast.toast({
        title: "Payment not completed",
        description: "No charge was made.",
        variant: "error",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkout(plan: Plan) {
    setBusyPlan(plan.id);
    try {
      const res = await api.post<{ redirectUrl: string; manual: boolean }>(
        "/api/billing/checkout",
        { planId: plan.id, provider: selectedProvider },
      );
      if (res.manual) {
        toast.toast({
          title: "Manual payment recorded",
          description: "An admin must approve it before it activates.",
        });
        window.location.href = res.redirectUrl;
        return;
      }
      window.location.href = res.redirectUrl;
    } catch (err) {
      toast.toast({
        title: "Could not start checkout",
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: "error",
      });
      setBusyPlan(null);
    }
  }

  async function toggleCancel() {
    if (!data?.subscription) return;
    setCancelling(true);
    try {
      await api.post("/api/billing/cancel", {
        cancel: !data.subscription.cancelAtPeriodEnd,
      });
      toast.toast({
        title: data.subscription.cancelAtPeriodEnd
          ? "Subscription will renew again"
          : "Subscription will end at the current period",
        variant: "success",
      });
      await load();
    } catch (err) {
      toast.toast({
        title: "Could not update subscription",
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Alert variant="error" title="Billing unavailable">
        {error ?? "Unknown error"}
      </Alert>
    );
  }

  const currentSlug = data.currentPlan?.slug;
  const configuredProviders = data.providers.filter((p) => p.configured);
  const manualEnabled = process.env.NODE_ENV !== "production";

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Manage your subscription and payment history.
          </p>
        </div>
        {data.subscription ? (
          <Badge variant={SUB_STATUS_VARIANT[data.subscription.status] ?? "outline"}>
            {data.subscription.status.replace("_", " ")}
          </Badge>
        ) : null}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              {data.currentPlan ? data.currentPlan.name : "No plan"}
            </CardTitle>
            <CardDescription>
              {data.subscription?.currentPeriodEnd
                ? `Renews on ${formatDate(data.subscription.currentPeriodEnd)}`
                : "No active subscription"}
              {data.subscription?.cancelAtPeriodEnd
                ? " - will not renew"
                : ""}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {data.currentPlan && Number(data.currentPlan.price) > 0 ? (
              <span className="text-lg font-semibold">
                {formatCurrency(data.currentPlan.price, data.currentPlan.currency)}
                <span className="text-sm font-normal text-muted-foreground">
                  /{data.currentPlan.interval}
                </span>
              </span>
            ) : null}
            {data.subscription && Number(data.currentPlan?.price ?? 0) > 0 ? (
              <Button
                variant="outline"
                size="sm"
                onClick={toggleCancel}
                disabled={cancelling}
              >
                {cancelling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : data.subscription.cancelAtPeriodEnd ? (
                  "Resume"
                ) : (
                  "Cancel renewal"
                )}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <UsageStat
              label={usageLabel("conversations")}
              used={data.usage.conversations ?? 0}
              limit={data.currentPlan?.maxConversations}
            />
            <UsageStat
              label={usageLabel("ai_replies")}
              used={data.usage.ai_replies ?? 0}
              limit={data.currentPlan?.maxAiReplies}
            />
            <UsageStat
              label={usageLabel("knowledge_mb")}
              used={data.usage.knowledge_mb ?? 0}
              limit={data.currentPlan?.maxKnowledgeMb}
              unit="MB"
            />
            <div className="rounded-lg border p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Team members
              </p>
              <p className="mt-1 text-xl font-semibold">
                {data.usage.agents ?? 0}
                <span className="text-sm font-normal text-muted-foreground">
                  {" "}
                  / {data.currentPlan?.maxAgents ?? "-"}
                </span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Plans</h2>
            <p className="text-sm text-muted-foreground">
              Upgrade or change your plan at any time.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Pay with</span>
            {configuredProviders.length === 0 && !manualEnabled ? (
              <Badge variant="warning">No gateway configured</Badge>
            ) : (
              <select
                className="h-9 rounded-md border bg-background px-3 text-sm"
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
              >
                {configuredProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
                {manualEnabled ? <option value="manual">Manual (test)</option> : null}
              </select>
            )}
          </div>
        </div>

        {configuredProviders.length === 0 && !manualEnabled ? (
          <div className="mb-4">
            <Alert variant="warning" title="Payments not configured">
              Add SSLCOMMERZ, bKash, or Nagad merchant credentials to enable paid
              plans. The free plan is always available.
            </Alert>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-3">
          {data.plans.map((plan) => {
            const isCurrent = plan.slug === currentSlug;
            const isFree = Number(plan.price) === 0;
            return (
              <Card
                key={plan.id}
                className={isCurrent ? "border-primary shadow-md" : undefined}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>{plan.name}</CardTitle>
                    {isCurrent ? <Badge>Current</Badge> : null}
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-2">
                    <span className="text-2xl font-bold">
                      {formatCurrency(plan.price, plan.currency)}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      /{plan.interval}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-emerald-600" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={isCurrent ? "outline" : isFree ? "secondary" : "default"}
                    disabled={isCurrent || isFree || busyPlan !== null}
                    onClick={() => void checkout(plan)}
                  >
                    {busyPlan === plan.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : isCurrent ? (
                      "Current plan"
                    ) : isFree ? (
                      "Free"
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4" />
                        Upgrade
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Payment history
          </CardTitle>
          <CardDescription>Invoices and receipts for this workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No payments yet.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Provider</TH>
                  <TH>Amount</TH>
                  <TH>Status</TH>
                  <TH>Date</TH>
                </TR>
              </THead>
              <TBody>
                {data.payments.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs">{p.invoiceNumber}</TD>
                    <TD className="capitalize">{p.provider}</TD>
                    <TD>{formatCurrency(p.amount, p.currency)}</TD>
                    <TD>
                      <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>
                        {p.status}
                      </Badge>
                    </TD>
                    <TD className="text-muted-foreground">
                      {formatDate(p.paidAt ?? p.createdAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {data.sandbox && configuredProviders.length > 0 ? (
        <Alert variant="info" title="Sandbox mode">
          Payments are running against the sandbox. Switch SSLCOMMERZ_SANDBOX off
          for live payments.
        </Alert>
      ) : null}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4" />
        All payments are verified server-side with the gateway before activation.
        <a
          href="https://developer.sslcommerz.com"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 hover:underline"
        >
          Docs <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function UsageStat({
  label,
  used,
  limit,
  unit,
}: {
  label: string;
  used: number;
  limit?: number;
  unit?: string;
}) {
  const pct = limit && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = limit !== undefined && limit > 0 && used > limit;
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold">
        {formatNumber(used)}
        {unit ? ` ${unit}` : ""}
        <span className="text-sm font-normal text-muted-foreground">
          {" "}
          / {limit === undefined ? "-" : formatNumber(limit)}
          {unit ? ` ${unit}` : ""}
        </span>
      </p>
      {limit ? (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={over ? "h-full bg-destructive" : "h-full bg-primary"}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

export function BillingUnavailable() {
  return (
    <Alert variant="error" title="Access denied">
      <span className="flex items-center gap-2">
        <X className="h-4 w-4" /> You do not have permission to manage billing.
      </span>
    </Alert>
  );
}
