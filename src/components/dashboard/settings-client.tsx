"use client";

import * as React from "react";
import { Check, Copy, Globe, Palette, Save, Settings2 } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Field, Select } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";

type Org = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  logoUrl: string | null;
  timezone: string;
  locale: string;
  currency: string;
  brandColor: string;
  status: string;
};

const TIMEZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "America/New_York",
  "UTC",
];

export function SettingsClient({
  initial,
  canManage,
  widgetSnippet,
}: {
  initial: Org;
  canManage: boolean;
  widgetSnippet: string;
}) {
  const [org, setOrg] = React.useState<Org>(initial);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const toast = useToast();

  function update<K extends keyof Org>(key: K, value: Org[K]) {
    setOrg((prev) => ({ ...prev, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch<{ organization: Org }>("/api/organization", {
        name: org.name,
        website: org.website ?? "",
        logoUrl: org.logoUrl ?? "",
        timezone: org.timezone,
        locale: org.locale,
        brandColor: org.brandColor,
      });
      setOrg(res.organization);
      toast.toast({ title: "Workspace settings saved", variant: "success" });
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not save settings",
      );
    } finally {
      setSaving(false);
    }
  }

  async function copySnippet() {
    await navigator.clipboard.writeText(widgetSnippet);
    setCopied(true);
    toast.toast({ title: "Widget snippet copied", variant: "success" });
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage workspace profile, localization, and branding.
        </p>
      </div>

      {!canManage ? (
        <Alert variant="warning" title="Read-only">
          Your role can view settings but not change them.
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="error" title="Could not save">
          {error}
        </Alert>
      ) : null}

      <form onSubmit={save} className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Settings2 className="h-4 w-4" />
                Workspace profile
              </CardTitle>
              <CardDescription>
                This information appears in your dashboard and customer emails.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Workspace name" htmlFor="name">
                  <Input
                    id="name"
                    value={org.name}
                    onChange={(e) => update("name", e.target.value)}
                    disabled={!canManage}
                    required
                    minLength={2}
                  />
                </Field>
                <Field label="Workspace URL" htmlFor="slug">
                  <Input id="slug" value={org.slug} disabled />
                </Field>
              </div>
              <Field label="Website" htmlFor="website">
                <Input
                  id="website"
                  type="url"
                  placeholder="https://example.com"
                  value={org.website ?? ""}
                  onChange={(e) => update("website", e.target.value)}
                  disabled={!canManage}
                />
              </Field>
              <Field label="Logo URL" htmlFor="logo">
                <Input
                  id="logo"
                  type="url"
                  placeholder="https://example.com/logo.png"
                  value={org.logoUrl ?? ""}
                  onChange={(e) => update("logoUrl", e.target.value)}
                  disabled={!canManage}
                />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Globe className="h-4 w-4" />
                Localization
              </CardTitle>
              <CardDescription>
                Used for timestamps and AI reply language.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Timezone" htmlFor="timezone">
                <Select
                  id="timezone"
                  value={org.timezone}
                  onChange={(e) => update("timezone", e.target.value)}
                  disabled={!canManage}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Default reply language" htmlFor="locale">
                <Select
                  id="locale"
                  value={org.locale}
                  onChange={(e) => update("locale", e.target.value)}
                  disabled={!canManage}
                >
                  <option value="en">English</option>
                  <option value="bn">Bangla</option>
                </Select>
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Palette className="h-4 w-4" />
                Branding
              </CardTitle>
              <CardDescription>
                Applied to the website chat widget and customer-facing UI.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Field label="Brand color" htmlFor="brandColor">
                <div className="flex items-center gap-3">
                  <input
                    id="brandColor"
                    type="color"
                    value={org.brandColor}
                    onChange={(e) => update("brandColor", e.target.value)}
                    disabled={!canManage}
                    className="h-10 w-14 cursor-pointer rounded border bg-transparent"
                  />
                  <Input
                    value={org.brandColor}
                    onChange={(e) => update("brandColor", e.target.value)}
                    disabled={!canManage}
                    pattern="^#[0-9a-fA-F]{6}$"
                    className="max-w-[160px] font-mono"
                  />
                  <div
                    className="h-10 flex-1 rounded-md border"
                    style={{ backgroundColor: org.brandColor }}
                  />
                </div>
              </Field>
            </CardContent>
          </Card>

          {canManage ? (
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                Save changes
              </Button>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Workspace ID</CardTitle>
              <CardDescription>Used when contacting support.</CardDescription>
            </CardHeader>
            <CardContent>
              <code className="block break-all rounded-md bg-muted p-2 text-xs">
                {org.id}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Website widget</CardTitle>
              <CardDescription>
                Paste before <code>&lt;/body&gt;</code> on your site.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                <code>{widgetSnippet}</code>
              </pre>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={copySnippet}
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy snippet"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Connect a Website channel in Integrations first, then the widget
                will start receiving messages.
              </p>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
