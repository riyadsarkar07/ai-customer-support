"use client";

import * as React from "react";
import {
  Workflow as WorkflowIcon,
  Plus,
  Trash2,
  Zap,
  Clock,
  ChevronDown,
  ChevronUp,
  Play,
  AlertTriangle,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Field, Select, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Alert, EmptyState, Spinner } from "@/components/ui/misc";
import { Switch } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toaster";
import { formatDateTime } from "@/lib/utils";

type Trigger = { type: string; config: Record<string, unknown> };
type Condition = { field: string; operator: string; value: string };
type Action = { type: string; config: Record<string, unknown> };

type Workflow = {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  trigger: Trigger;
  conditions: Condition[];
  actions: Action[];
  executionCount: number;
  lastRunAt: string | null;
  createdAt: string;
};

type Run = {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  error: string | null;
};

const TRIGGERS = [
  { value: "message_received", label: "New message received" },
  { value: "keyword_match", label: "Message contains keywords" },
  { value: "conversation_created", label: "New conversation created" },
];

const ACTION_TYPES = [
  { value: "add_tag", label: "Add tag" },
  { value: "assign_agent", label: "Assign to agent" },
  { value: "set_priority", label: "Set priority" },
  { value: "set_status", label: "Set status" },
  { value: "pause_ai", label: "Pause AI for conversation" },
  { value: "send_reply", label: "Send approved reply" },
  { value: "business_hours_check", label: "Check business hours" },
];

export function AutomationsClient({
  members,
}: {
  members: Array<{ id: string; name: string }>;
}) {
  const [workflows, setWorkflows] = React.useState<Workflow[]>([]);
  const [runs, setRuns] = React.useState<Run[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Workflow | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const toast = useToast();

  const [form, setForm] = React.useState({
    name: "",
    description: "",
    triggerType: "message_received",
    keywords: "",
    conditions: [] as Condition[],
    actions: [] as Action[],
  });

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{
        workflows: Workflow[];
        recentRuns: Run[];
      }>("/api/workflows");
      setWorkflows(res.workflows);
      setRuns(res.recentRuns);
    } catch (err) {
      toast.toast({
        title: "Failed to load automations",
        description: err instanceof ApiClientError ? err.message : "Error",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setForm({
      name: "",
      description: "",
      triggerType: "message_received",
      keywords: "",
      conditions: [],
      actions: [],
    });
    setError(null);
    setOpen(true);
  }

  function openEdit(w: Workflow) {
    setEditing(w);
    const conds = Array.isArray(w.conditions) ? w.conditions : [];
    setForm({
      name: w.name,
      description: w.description ?? "",
      triggerType: w.trigger?.type ?? "message_received",
      keywords: String(w.trigger?.config?.keywords ?? ""),
      conditions: conds.map((c) => ({
        field: String(c.field ?? "text"),
        operator: String(c.operator ?? "contains"),
        value: String(c.value ?? ""),
      })),
      actions: Array.isArray(w.actions)
        ? w.actions.map((a) => ({
            type: String(a.type),
            config: (a.config as Record<string, unknown>) ?? {},
          }))
        : [],
    });
    setError(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        description: form.description || undefined,
        trigger: {
          type: form.triggerType,
          config:
            form.triggerType === "keyword_match"
              ? { keywords: form.keywords }
              : {},
        },
        conditions: form.conditions.filter((c) => c.value),
        actions: form.actions,
      };
      if (editing) {
        await api.patch(`/api/workflows/${editing.id}`, payload);
      } else {
        await api.post("/api/workflows", payload);
      }
      setOpen(false);
      await load();
      toast.toast({ title: editing ? "Automation updated" : "Automation created", variant: "success" });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(w: Workflow) {
    try {
      await api.patch(`/api/workflows/${w.id}`, { enabled: !w.enabled });
      setWorkflows((prev) =>
        prev.map((x) => (x.id === w.id ? { ...x, enabled: !x.enabled } : x)),
      );
    } catch {
      toast.toast({ title: "Could not toggle automation", variant: "error" });
    }
  }

  async function remove(w: Workflow) {
    if (!confirm(`Delete automation "${w.name}"?`)) return;
    try {
      await api.del(`/api/workflows/${w.id}`);
      await load();
      toast.toast({ title: "Automation deleted", variant: "success" });
    } catch {
      toast.toast({ title: "Delete failed", variant: "error" });
    }
  }

  function addAction(type: string) {
    const defaults: Record<string, Record<string, unknown>> = {
      add_tag: { tag: "" },
      assign_agent: { agentId: members[0]?.id ?? "" },
      set_priority: { priority: "high" },
      set_status: { status: "pending" },
      send_reply: { message: "" },
      business_hours_check: {
        enabled: true,
        timezone: "Asia/Dhaka",
        start: "09:00",
        end: "18:00",
        days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
        stopOutsideHours: false,
      },
      pause_ai: {},
    };
    setForm((f) => ({
      ...f,
      actions: [...f.actions, { type, config: defaults[type] ?? {} }],
    }));
  }

  function updateAction(index: number, patch: Record<string, unknown>) {
    setForm((f) => ({
      ...f,
      actions: f.actions.map((a, i) =>
        i === index ? { ...a, config: { ...a.config, ...patch } } : a,
      ),
    }));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Automations</h1>
          <p className="text-sm text-muted-foreground">
            Trigger actions automatically based on message content and channel.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New automation
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : workflows.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={<WorkflowIcon className="h-8 w-8" />}
              title="No automations yet"
              description="Create a rule to tag conversations, assign agents, or send approved replies automatically."
              action={
                <Button size="sm" onClick={openCreate}>
                  <Plus className="h-4 w-4" /> Create automation
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {workflows.map((w) => {
            const isExpanded = expanded === w.id;
            const wfRuns = runs.filter((r) => r.workflowId === w.id);
            return (
              <Card key={w.id}>
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Zap className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold">{w.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {w.description || "No description"} ·{" "}
                          {TRIGGERS.find((t) => t.value === w.trigger?.type)?.label ??
                            w.trigger?.type}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Ran {w.executionCount} time{w.executionCount === 1 ? "" : "s"}
                          {w.lastRunAt ? ` · last ${formatDateTime(w.lastRunAt)}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={w.enabled}
                        onChange={() => toggle(w)}
                        label="Enable automation"
                      />
                      <Button size="sm" variant="outline" onClick={() => openEdit(w)}>
                        Edit
                      </Button>
                      <button
                        onClick={() => remove(w)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label="Delete automation"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setExpanded(isExpanded ? null : w.id)}
                        className="rounded p-1.5 hover:bg-muted"
                        aria-label="Toggle runs"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(w.actions as Action[]).map((a, i) => (
                      <Badge key={i} variant="secondary">
                        {ACTION_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                      </Badge>
                    ))}
                  </div>

                  {isExpanded && (
                    <div className="mt-3 rounded-lg border bg-muted/30 p-3">
                      <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase text-muted-foreground">
                        <Clock className="h-3 w-3" /> Recent executions
                      </p>
                      {wfRuns.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No executions yet. Trigger this automation by sending a
                          matching message.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {wfRuns.map((r) => (
                            <div
                              key={r.id}
                              className="flex items-center justify-between text-xs"
                            >
                              <span>{formatDateTime(r.startedAt)}</span>
                              <Badge
                                variant={
                                  r.status === "completed"
                                    ? "success"
                                    : r.status === "failed"
                                      ? "destructive"
                                      : "secondary"
                                }
                              >
                                {r.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit automation" : "New automation"}
        className="max-w-2xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy} disabled={!form.name || form.actions.length === 0}>
              Save automation
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <Field label="Name" htmlFor="wf-name">
            <Input
              id="wf-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Tag VIP customers"
            />
          </Field>
          <Field label="Description" htmlFor="wf-desc">
            <Input
              id="wf-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </Field>

          <div className="rounded-lg border p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Trigger
            </p>
            <Select
              value={form.triggerType}
              onChange={(e) => setForm({ ...form, triggerType: e.target.value })}
            >
              {TRIGGERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
            {form.triggerType === "keyword_match" && (
              <Input
                className="mt-2"
                placeholder="refund, delivery, wholesale (comma separated)"
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              />
            )}
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Conditions (all must match)
              </p>
              <button
                className="text-xs text-primary hover:underline"
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    conditions: [
                      ...f.conditions,
                      { field: "text", operator: "contains", value: "" },
                    ],
                  }))
                }
              >
                + Add condition
              </button>
            </div>
            {form.conditions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Optional. The automation runs when the trigger fires.
              </p>
            )}
            {form.conditions.map((c, i) => (
              <div key={i} className="mb-2 flex gap-1.5">
                <Select
                  value={c.field}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      conditions: f.conditions.map((x, idx) =>
                        idx === i ? { ...x, field: e.target.value } : x,
                      ),
                    }))
                  }
                  className="h-8 w-24 text-xs"
                >
                  <option value="text">message</option>
                  <option value="channel">channel</option>
                  <option value="status">status</option>
                </Select>
                <Select
                  value={c.operator}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      conditions: f.conditions.map((x, idx) =>
                        idx === i ? { ...x, operator: e.target.value } : x,
                      ),
                    }))
                  }
                  className="h-8 w-28 text-xs"
                >
                  <option value="contains">contains</option>
                  <option value="not_contains">not contains</option>
                  <option value="equals">equals</option>
                  <option value="starts_with">starts with</option>
                  <option value="regex">regex</option>
                </Select>
                <Input
                  className="h-8 flex-1 text-xs"
                  value={c.value}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      conditions: f.conditions.map((x, idx) =>
                        idx === i ? { ...x, value: e.target.value } : x,
                      ),
                    }))
                  }
                  placeholder="value"
                />
                <button
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      conditions: f.conditions.filter((_, idx) => idx !== i),
                    }))
                  }
                  className="rounded p-1 text-muted-foreground hover:text-destructive"
                  aria-label="Remove condition"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          <div className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Actions (in order)
              </p>
              <Select
                value=""
                onChange={(e) => e.target.value && addAction(e.target.value)}
                className="h-8 w-40 text-xs"
              >
                <option value="">+ Add action</option>
                {ACTION_TYPES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </div>
            {form.actions.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Add at least one action.
              </p>
            )}
            {form.actions.map((a, i) => (
              <div key={i} className="mb-2 rounded-md bg-muted/40 p-2">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-xs font-medium">
                    {ACTION_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                  </span>
                  <button
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        actions: f.actions.filter((_, idx) => idx !== i),
                      }))
                    }
                    className="rounded p-1 text-muted-foreground hover:text-destructive"
                    aria-label="Remove action"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {a.type === "add_tag" && (
                  <Input
                    className="h-8 text-xs"
                    placeholder="vip"
                    value={String(a.config.tag ?? "")}
                    onChange={(e) => updateAction(i, { tag: e.target.value })}
                  />
                )}
                {a.type === "assign_agent" && (
                  <Select
                    className="h-8 text-xs"
                    value={String(a.config.agentId ?? "")}
                    onChange={(e) => updateAction(i, { agentId: e.target.value })}
                  >
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                )}
                {a.type === "set_priority" && (
                  <Select
                    className="h-8 text-xs"
                    value={String(a.config.priority ?? "high")}
                    onChange={(e) => updateAction(i, { priority: e.target.value })}
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </Select>
                )}
                {a.type === "set_status" && (
                  <Select
                    className="h-8 text-xs"
                    value={String(a.config.status ?? "pending")}
                    onChange={(e) => updateAction(i, { status: e.target.value })}
                  >
                    <option value="open">Open</option>
                    <option value="pending">Pending</option>
                    <option value="resolved">Resolved</option>
                    <option value="archived">Archived</option>
                  </Select>
                )}
                {a.type === "send_reply" && (
                  <Textarea
                    className="min-h-[60px] text-xs"
                    placeholder="Approved reply text..."
                    value={String(a.config.message ?? "")}
                    onChange={(e) => updateAction(i, { message: e.target.value })}
                  />
                )}
                {a.type === "business_hours_check" && (
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input
                      className="h-8 text-xs"
                      placeholder="09:00"
                      value={String(a.config.start ?? "09:00")}
                      onChange={(e) => updateAction(i, { start: e.target.value })}
                    />
                    <Input
                      className="h-8 text-xs"
                      placeholder="18:00"
                      value={String(a.config.end ?? "18:00")}
                      onChange={(e) => updateAction(i, { end: e.target.value })}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          <Alert variant="info">
            <span className="flex items-center gap-1">
              <Play className="h-3 w-3" /> Automations are evaluated on every
              inbound message, in order of creation. Each run is recorded with its
              steps for auditing.
            </span>
          </Alert>
        </div>
      </Dialog>

      {runs.some((r) => r.status === "failed") && (
        <Alert variant="warning" title="Some automations failed recently">
          <span className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> Open an automation and expand it
            to inspect failed runs.
          </span>
        </Alert>
      )}
    </div>
  );
}
