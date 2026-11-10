"use client";

import * as React from "react";
import {
  Plug,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  ExternalLink,
  Bot,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Field, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Alert, EmptyState, Spinner } from "@/components/ui/misc";
import { Switch } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toaster";
import { timeAgo } from "@/lib/utils";

type Channel = {
  id: string;
  type: string;
  name: string;
  status: string;
  externalId: string | null;
  aiEnabled: boolean;
  lastError: string | null;
  lastEventAt: string | null;
  createdAt: string;
  publicKey?: string;
  allowedOrigins?: string;
};

type CatalogItem = {
  type: string;
  label: string;
  description: string;
  requiresOAuth: boolean;
  setupFields: Array<{
    key: string;
    label: string;
    type: string;
    required: boolean;
    hint?: string;
  }>;
  docsUrl?: string;
};

const BRAND: Record<string, string> = {
  website: "bg-slate-700",
  telegram: "bg-sky-500",
  facebook: "bg-blue-600",
  instagram: "bg-pink-600",
  whatsapp: "bg-emerald-500",
  gmail: "bg-red-500",
  outlook: "bg-indigo-600",
};

export function IntegrationsClient({
  appUrl,
}: {
  appUrl: string;
}) {
  const [channels, setChannels] = React.useState<Channel[]>([]);
  const [catalog, setCatalog] = React.useState<CatalogItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<Record<string, string>>({});
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<Channel | null>(null);
  const toast = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{
        channels: Channel[];
        catalog: CatalogItem[];
        appUrl: string;
      }>("/api/channels");
      setChannels(res.channels);
      setCatalog(res.catalog);
    } catch (err) {
      toast.toast({
        title: "Failed to load integrations",
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

  const websiteConnected = channels.some((c) => c.type === "website");

  async function connect(type: string) {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { type, name: name || undefined };
      for (const [k, v] of Object.entries(form)) {
        if (v) payload[k] = v;
      }
      await api.post("/api/channels", payload);
      setSelected(null);
      setForm({});
      setName("");
      await load();
      toast.toast({ title: "Channel connected", variant: "success" });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Connection failed");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(ch: Channel) {
    if (!confirm(`Disconnect "${ch.name}"? Conversations are kept but no new messages will arrive.`)) return;
    try {
      await api.del(`/api/channels/${ch.id}`);
      await load();
      setDetail(null);
      toast.toast({ title: "Channel disconnected", variant: "success" });
    } catch (err) {
      toast.toast({
        title: "Disconnect failed",
        description: err instanceof ApiClientError ? err.message : "Error",
        variant: "error",
      });
    }
  }

  async function toggleAi(ch: Channel, value: boolean) {
    try {
      await api.patch(`/api/channels/${ch.id}`, { aiEnabled: value });
      setChannels((prev) =>
        prev.map((c) => (c.id === ch.id ? { ...c, aiEnabled: value } : c)),
      );
    } catch {
      toast.toast({ title: "Could not update AI toggle", variant: "error" });
    }
  }

  async function reregister(ch: Channel) {
    try {
      await api.post(`/api/channels/${ch.id}/webhook`);
      toast.toast({ title: "Webhook re-registered", variant: "success" });
      await load();
    } catch (err) {
      toast.toast({
        title: "Webhook registration failed",
        description: err instanceof ApiClientError ? err.message : "Error",
        variant: "error",
      });
    }
  }

  function copy(text: string, key: string) {
    void navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  const selectedCatalog = catalog.find((c) => c.type === selected);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-sm text-muted-foreground">
          Connect official channels. We never scrape or use unofficial APIs.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Connected channels ({channels.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {channels.length === 0 ? (
                <EmptyState
                  icon={<Plug className="h-8 w-8" />}
                  title="No channels connected"
                  description="Start with the website widget or a Telegram bot - both work instantly without business verification."
                />
              ) : (
                <div className="space-y-2">
                  {channels.map((ch) => (
                    <div
                      key={ch.id}
                      className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ${BRAND[ch.type] ?? "bg-slate-600"}`}
                      >
                        {ch.type.slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <button
                          onClick={() => setDetail(ch)}
                          className="truncate text-sm font-medium hover:underline"
                        >
                          {ch.name}
                        </button>
                        <p className="text-xs text-muted-foreground">
                          {ch.status === "connected" ? (
                            <>
                              Connected
                              {ch.lastEventAt
                                ? ` · last event ${timeAgo(ch.lastEventAt)}`
                                : " · waiting for first message"}
                            </>
                          ) : (
                            ch.lastError ?? ch.status
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            ch.status === "connected"
                              ? "success"
                              : ch.status === "error"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {ch.status}
                        </Badge>
                        <div className="flex items-center gap-1.5 rounded-full border px-2 py-1">
                          <Bot className="h-3 w-3 text-muted-foreground" />
                          <Switch
                            checked={ch.aiEnabled}
                            onChange={(v) => toggleAi(ch, v)}
                            label="AI on channel"
                          />
                        </div>
                        <button
                          onClick={() => setDetail(ch)}
                          className="rounded p-1.5 hover:bg-muted"
                          aria-label="Channel details"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardContent className="p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-700 text-xs font-bold text-white">
                  WEB
                </span>
                <h3 className="mt-3 font-semibold">Website Live Chat</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Embed an AI-powered chat widget on your site. No verification
                  needed.
                </p>
                {websiteConnected ? (
                  <Badge variant="success" className="mt-3">
                    Connected
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={() => {
                      setSelected("website");
                      setForm({});
                      setName("Website Chat");
                      setError(null);
                    }}
                  >
                    <Plus className="h-4 w-4" /> Connect
                  </Button>
                )}
              </CardContent>
            </Card>

            {catalog.map((c) => {
              const connected = channels.some((ch) => ch.type === c.type);
              return (
                <Card key={c.type}>
                  <CardContent className="p-5">
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-lg text-xs font-bold text-white ${BRAND[c.type] ?? "bg-slate-600"}`}
                    >
                      {c.type.slice(0, 2).toUpperCase()}
                    </span>
                    <h3 className="mt-3 font-semibold">{c.label}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {c.description}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(c.type);
                          setForm({});
                          setName(c.label);
                          setError(null);
                        }}
                      >
                        <Plus className="h-4 w-4" />
                        {connected ? "Add another" : "Connect"}
                      </Button>
                      {c.docsUrl && (
                        <a
                          href={c.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline"
                        >
                          Setup guide
                        </a>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={`Connect ${selectedCatalog?.label ?? "Website Live Chat"}`}
        description="Credentials are encrypted before storage and never sent to the browser."
        footer={
          <>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => selected && connect(selected)}
              loading={busy}
            >
              Connect
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && <Alert variant="error">{error}</Alert>}
          {selected !== "website" && (
            <Alert variant="info">
              You need a working developer app and the required permissions from{" "}
              {selectedCatalog?.label}. Paste the credentials below.{" "}
              {selectedCatalog?.docsUrl && (
                <a
                  href={selectedCatalog.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Open docs
                </a>
              )}
            </Alert>
          )}
          <Field label="Display name" htmlFor="ch-name">
            <Input
              id="ch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>

          {selected === "website" && (
            <Field
              label="Allowed origins (optional)"
              htmlFor="origins"
              hint="Comma-separated domains allowed to embed the widget."
            >
              <Input
                id="origins"
                value={form.allowedOrigins ?? ""}
                onChange={(e) =>
                  setForm({ ...form, allowedOrigins: e.target.value })
                }
                placeholder="https://example.com"
              />
            </Field>
          )}

          {selected === "telegram" && (
            <Field label="Bot token" htmlFor="botToken">
              <Input
                id="botToken"
                type="password"
                value={form.botToken ?? ""}
                onChange={(e) => setForm({ ...form, botToken: e.target.value })}
                placeholder="123456:ABC-DEF..."
              />
            </Field>
          )}

          {selected === "facebook" && (
            <>
              <Field label="Page ID" htmlFor="pageId">
                <Input
                  id="pageId"
                  value={form.pageId ?? ""}
                  onChange={(e) => setForm({ ...form, pageId: e.target.value })}
                />
              </Field>
              <Field label="Page access token" htmlFor="pageAccessToken">
                <Input
                  id="pageAccessToken"
                  type="password"
                  value={form.pageAccessToken ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, pageAccessToken: e.target.value })
                  }
                />
              </Field>
            </>
          )}

          {selected === "instagram" && (
            <>
              <Field label="Instagram account ID" htmlFor="igId">
                <Input
                  id="igId"
                  value={form.igAccountId ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, igAccountId: e.target.value })
                  }
                />
              </Field>
              <Field label="Page access token" htmlFor="igToken">
                <Input
                  id="igToken"
                  type="password"
                  value={form.pageAccessToken ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, pageAccessToken: e.target.value })
                  }
                />
              </Field>
            </>
          )}

          {selected === "whatsapp" && (
            <>
              <Field label="Phone number ID" htmlFor="phoneId">
                <Input
                  id="phoneId"
                  value={form.phoneNumberId ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, phoneNumberId: e.target.value })
                  }
                />
              </Field>
              <Field label="Permanent access token" htmlFor="waToken">
                <Input
                  id="waToken"
                  type="password"
                  value={form.accessToken ?? ""}
                  onChange={(e) =>
                    setForm({ ...form, accessToken: e.target.value })
                  }
                />
              </Field>
            </>
          )}

          {(selected === "gmail" || selected === "outlook") && (
            <Field
              label="OAuth refresh token"
              htmlFor="refresh"
              hint="Server OAuth client credentials must also be configured."
            >
              <Input
                id="refresh"
                type="password"
                value={form.refreshToken ?? ""}
                onChange={(e) =>
                  setForm({ ...form, refreshToken: e.target.value })
                }
              />
            </Field>
          )}
        </div>
      </Dialog>

      <Dialog
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={detail?.name ?? "Channel"}
        description={detail ? `${detail.type} · ${detail.status}` : undefined}
        footer={
          detail ? (
            <>
              {detail.type === "telegram" && (
                <Button variant="outline" onClick={() => reregister(detail)}>
                  <RefreshCw className="h-4 w-4" /> Re-register webhook
                </Button>
              )}
              <Button
                variant="destructive"
                onClick={() => disconnect(detail)}
              >
                <Trash2 className="h-4 w-4" /> Disconnect
              </Button>
            </>
          ) : undefined
        }
      >
        {detail && (
          <div className="space-y-3 text-sm">
            {detail.lastError && (
              <Alert variant="error" title="Last error">
                {detail.lastError}
              </Alert>
            )}

            {detail.type === "website" && detail.publicKey && (
              <div className="space-y-2">
                <p className="font-medium">Embed this on your website</p>
                <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
{`<script src="${appUrl}/widget.js"
  data-key="${detail.publicKey}" async></script>`}
                </pre>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    copy(
                      `<script src="${appUrl}/widget.js" data-key="${detail.publicKey}" async></script>`,
                      "embed",
                    )
                  }
                >
                  {copied === "embed" ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  Copy embed code
                </Button>
                <p className="text-xs text-muted-foreground">
                  Public key: <code>{detail.publicKey}</code>
                </p>
              </div>
            )}

            {detail.type === "telegram" && (
              <div className="space-y-1">
                <p className="font-medium">Webhook URL</p>
                <code className="block break-all rounded bg-muted p-2 text-xs">
                  {appUrl}/api/webhooks/telegram/{detail.id}
                </code>
                <p className="text-xs text-muted-foreground">
                  Automatically registered when you connected the bot. Use
                  &quot;Re-register&quot; if the app URL changed.
                </p>
              </div>
            )}

            {(detail.type === "facebook" ||
              detail.type === "instagram" ||
              detail.type === "whatsapp") && (
              <div className="space-y-1">
                <p className="font-medium">Meta webhook callback URL</p>
                <code className="block break-all rounded bg-muted p-2 text-xs">
                  {appUrl}/api/webhooks/meta
                </code>
                <p className="flex items-start gap-1 text-xs text-muted-foreground">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  Configure this URL plus your verify token and app secret in the
                  Meta developer console. Messages are matched to this workspace
                  only through the verified connection.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <p className="font-medium">AI replies on this channel</p>
                <p className="text-xs text-muted-foreground">
                  Turn off to keep this channel human-only.
                </p>
              </div>
              <Switch
                checked={detail.aiEnabled}
                onChange={(v) => {
                  void toggleAi(detail, v);
                  setDetail({ ...detail, aiEnabled: v });
                }}
                label="AI on channel"
              />
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
