"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ArrowRight, Globe, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field, Select } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { api, ApiClientError } from "@/lib/api/client";
import { useToast } from "@/components/ui/toaster";

const TIMEZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "UTC",
  "Europe/London",
  "America/New_York",
];

export function OnboardingWizard({
  initial,
}: {
  initial: {
    name: string;
    website: string | null;
    timezone: string;
    locale: string;
    brandColor: string;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = React.useState(0);
  const [form, setForm] = React.useState({
    name: initial.name,
    website: initial.website ?? "",
    timezone: initial.timezone,
    locale: initial.locale,
    brandColor: initial.brandColor,
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const steps = ["Business", "Preferences", "Connect"];

  async function save(complete: boolean) {
    setSaving(true);
    setError(null);
    try {
      await api.patch("/api/organization", { ...form, complete });
      if (complete) {
        toast.toast({ title: "Workspace ready", variant: "success" });
        router.push("/dashboard/integrations");
        router.refresh();
      } else {
        setStep((s) => Math.min(steps.length - 1, s + 1));
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-2xl font-bold">Set up your workspace</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A few details so your AI assistant can represent your business
          correctly.
        </p>
      </div>

      <div className="mb-6 flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <React.Fragment key={s}>
            <div
              className={`flex items-center gap-2 text-sm ${i <= step ? "text-primary" : "text-muted-foreground"}`}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                  i < step
                    ? "border-primary bg-primary text-primary-foreground"
                    : i === step
                      ? "border-primary text-primary"
                      : "border-muted-foreground/30"
                }`}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s}</span>
            </div>
            {i < steps.length - 1 && (
              <div className="h-px w-8 bg-border sm:w-12" />
            )}
          </React.Fragment>
        ))}
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          {error && (
            <p className="rounded-md bg-red-50 p-2 text-sm text-red-700">{error}</p>
          )}

          {step === 0 && (
            <>
              <Field label="Business name" htmlFor="ob-name">
                <Input
                  id="ob-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field
                label="Website (optional)"
                htmlFor="ob-site"
                hint="Used for your live chat widget and knowledge imports."
              >
                <Input
                  id="ob-site"
                  placeholder="https://example.com"
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                />
              </Field>
              <div className="flex justify-end">
                <Button onClick={() => save(false)} loading={saving}>
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <Field
                label="Default language"
                htmlFor="ob-locale"
                hint="The AI auto-detects customer language, but this sets defaults."
              >
                <Select
                  id="ob-locale"
                  value={form.locale}
                  onChange={(e) => setForm({ ...form, locale: e.target.value })}
                >
                  <option value="en">English</option>
                  <option value="bn">বাংলা (Bangla)</option>
                </Select>
              </Field>
              <Field label="Timezone" htmlFor="ob-tz">
                <Select
                  id="ob-tz"
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Brand color"
                htmlFor="ob-color"
                hint="Used in your website chat widget."
              >
                <div className="flex items-center gap-3">
                  <input
                    id="ob-color"
                    type="color"
                    value={form.brandColor}
                    onChange={(e) =>
                      setForm({ ...form, brandColor: e.target.value })
                    }
                    className="h-10 w-14 cursor-pointer rounded border"
                  />
                  <Input
                    value={form.brandColor}
                    onChange={(e) =>
                      setForm({ ...form, brandColor: e.target.value })
                    }
                    className="max-w-[140px]"
                  />
                </div>
              </Field>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button onClick={() => save(false)} loading={saving}>
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <Globe className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Connect your channels</p>
                    <p className="text-xs text-muted-foreground">
                      Start with the website widget or a Telegram bot - both work
                      immediately. Facebook, Instagram, WhatsApp, Gmail, and
                      Outlook require developer app credentials.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <Palette className="mt-0.5 h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Teach your AI</p>
                    <p className="text-xs text-muted-foreground">
                      Add your FAQ, policies, and product details in the
                      Knowledge Base so the AI never invents facts.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={() => save(true)} loading={saving}>
                  Finish setup <Check className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
