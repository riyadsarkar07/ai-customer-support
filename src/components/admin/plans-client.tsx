"use client";

import * as React from "react";
import { Pencil, Plus } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Field, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, Spinner } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toaster";
import { formatCurrency } from "@/lib/utils";

type Plan = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: string;
  currency: string;
  interval: "monthly" | "yearly" | "lifetime";
  trialDays: number;
  maxAgents: number;
  maxConversations: number;
  maxChannels: number;
  maxKnowledgeMb: number;
  maxAiReplies: number;
  features: string[];
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
};

type Draft = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  price: string;
  currency: string;
  interval: "monthly" | "yearly" | "lifetime";
  trialDays: number;
  maxAgents: number;
  maxConversations: number;
  maxChannels: number;
  maxKnowledgeMb: number;
  maxAiReplies: number;
  features: string;
  isActive: boolean;
  isPublic: boolean;
  sortOrder: number;
};

const EMPTY: Draft = {
  name: "",
  slug: "",
  description: "",
  price: "0",
  currency: "BDT",
  interval: "monthly",
  trialDays: 14,
  maxAgents: 3,
  maxConversations: 1000,
  maxChannels: 1,
  maxKnowledgeMb: 10,
  maxAiReplies: 500,
  features: "",
  isActive: true,
  isPublic: true,
  sortOrder: 0,
};

export function PlansClient() {
  const [plans, setPlans] = React.useState<Plan[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const toast = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ plans: Plan[] }>("/api/admin/plans");
      setPlans(res.plans);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load plans");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  function edit(plan: Plan) {
    setDraft({
      id: plan.id,
      name: plan.name,
      slug: plan.slug,
      description: plan.description ?? "",
      price: plan.price,
      currency: plan.currency,
      interval: plan.interval,
      trialDays: plan.trialDays,
      maxAgents: plan.maxAgents,
      maxConversations: plan.maxConversations,
      maxChannels: plan.maxChannels,
      maxKnowledgeMb: plan.maxKnowledgeMb,
      maxAiReplies: plan.maxAiReplies,
      features: plan.features.join("\n"),
      isActive: plan.isActive,
      isPublic: plan.isPublic,
      sortOrder: plan.sortOrder,
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...draft,
        description: draft.description || undefined,
        price: Number(draft.price),
        features: draft.features
          .split("\n")
          .map((f) => f.trim())
          .filter(Boolean),
      };
      if (draft.id) {
        await api.patch("/api/admin/plans", payload);
        toast.toast({ title: "Plan updated", variant: "success" });
      } else {
        await api.post("/api/admin/plans", payload);
        toast.toast({ title: "Plan created", variant: "success" });
      }
      setOpen(false);
      setDraft(EMPTY);
      await load();
    } catch (err) {
      toast.toast({
        title: "Could not save plan",
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  function num(field: keyof Draft) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setDraft((d) => ({ ...d, [field]: Number(e.target.value) }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Plans</h1>
          <p className="text-sm text-muted-foreground">
            Pricing and feature limits for every workspace.
          </p>
        </div>
        <Button
          onClick={() => {
            setDraft(EMPTY);
            setOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New plan
        </Button>
      </div>

      {error ? (
        <Alert variant="error" title="Could not load">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <THead>
              <TR>
                <TH>Plan</TH>
                <TH>Price</TH>
                <TH>Limits</TH>
                <TH>Visibility</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {plans.map((p) => (
                <TR key={p.id}>
                  <TD>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.slug}</p>
                  </TD>
                  <TD>
                    {formatCurrency(p.price, p.currency)}
                    <span className="text-xs text-muted-foreground">/{p.interval}</span>
                  </TD>
                  <TD className="text-xs text-muted-foreground">
                    {p.maxAgents} agents · {p.maxConversations} convs · {p.maxChannels}{" "}
                    channels
                  </TD>
                  <TD>
                    <div className="flex gap-1">
                      <Badge variant={p.isActive ? "success" : "outline"}>
                        {p.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {p.isPublic ? <Badge variant="outline">Public</Badge> : null}
                    </div>
                  </TD>
                  <TD className="text-right">
                    <Button size="sm" variant="outline" onClick={() => edit(p)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={draft.id ? "Edit plan" : "New plan"}
        description="Plan limits are enforced server-side when creating resources."
        className="max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : draft.id ? "Save plan" : "Create plan"}
            </Button>
          </>
        }
      >
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="plan-name">
              <Input
                id="plan-name"
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                required
              />
            </Field>
            <Field label="Slug" htmlFor="plan-slug">
              <Input
                id="plan-slug"
                value={draft.slug}
                onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
                pattern="^[a-z0-9-]+$"
                required
              />
            </Field>
          </div>
          <Field label="Description" htmlFor="plan-desc">
            <Textarea
              id="plan-desc"
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              rows={2}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Price" htmlFor="plan-price">
              <Input
                id="plan-price"
                type="number"
                min={0}
                step="0.01"
                value={draft.price}
                onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
              />
            </Field>
            <Field label="Currency" htmlFor="plan-currency">
              <Input
                id="plan-currency"
                value={draft.currency}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, currency: e.target.value.toUpperCase() }))
                }
                maxLength={3}
              />
            </Field>
            <Field label="Interval" htmlFor="plan-interval">
              <Select
                id="plan-interval"
                value={draft.interval}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    interval: e.target.value as Draft["interval"],
                  }))
                }
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="lifetime">Lifetime</option>
              </Select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Trial days" htmlFor="plan-trial">
              <Input
                id="plan-trial"
                type="number"
                min={0}
                value={draft.trialDays}
                onChange={num("trialDays")}
              />
            </Field>
            <Field label="Max agents" htmlFor="plan-agents">
              <Input
                id="plan-agents"
                type="number"
                min={1}
                value={draft.maxAgents}
                onChange={num("maxAgents")}
              />
            </Field>
            <Field label="Max channels" htmlFor="plan-channels">
              <Input
                id="plan-channels"
                type="number"
                min={1}
                value={draft.maxChannels}
                onChange={num("maxChannels")}
              />
            </Field>
            <Field label="Max conversations" htmlFor="plan-convs">
              <Input
                id="plan-convs"
                type="number"
                min={100}
                value={draft.maxConversations}
                onChange={num("maxConversations")}
              />
            </Field>
            <Field label="Knowledge MB" htmlFor="plan-kb">
              <Input
                id="plan-kb"
                type="number"
                min={1}
                value={draft.maxKnowledgeMb}
                onChange={num("maxKnowledgeMb")}
              />
            </Field>
            <Field label="AI replies" htmlFor="plan-ai">
              <Input
                id="plan-ai"
                type="number"
                min={0}
                value={draft.maxAiReplies}
                onChange={num("maxAiReplies")}
              />
            </Field>
          </div>
          <Field label="Features (one per line)" htmlFor="plan-features">
            <Textarea
              id="plan-features"
              value={draft.features}
              onChange={(e) =>
                setDraft((d) => ({ ...d, features: e.target.value }))
              }
              rows={4}
            />
          </Field>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, isActive: e.target.checked }))
                }
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.isPublic}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, isPublic: e.target.checked }))
                }
              />
              Public
            </label>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
