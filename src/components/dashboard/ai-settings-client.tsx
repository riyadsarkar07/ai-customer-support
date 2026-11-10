"use client";

import * as React from "react";
import { Sparkles, Save, Bot, AlertTriangle } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Field, Select, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/tabs";
import { Alert, Spinner } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toaster";

type Settings = {
  enabled: boolean;
  model: string;
  personality: string;
  tone: string;
  languages: string[];
  autoDetectLanguage: boolean;
  confidenceThreshold: string;
  handoverOnLowConfidence: boolean;
  businessRules: string;
  greetingMessage: string;
  aiPaused: boolean;
  maxContextChunks: number;
  temperature: string;
};

export function AiSettingsClient() {
  const [settings, setSettings] = React.useState<Settings | null>(null);
  const [configured, setConfigured] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const toast = useToast();

  React.useEffect(() => {
    (async () => {
      try {
        const res = await api.get<{
          settings: Settings;
          providerConfigured: boolean;
        }>("/api/ai/settings");
        setSettings(res.settings);
        setConfigured(res.providerConfigured);
      } catch (err) {
        setError(err instanceof ApiClientError ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.patch<{ settings: Settings }>("/api/ai/settings", {
        enabled: settings.enabled,
        model: settings.model,
        personality: settings.personality,
        tone: settings.tone,
        languages: settings.languages,
        autoDetectLanguage: settings.autoDetectLanguage,
        confidenceThreshold: Number(settings.confidenceThreshold),
        handoverOnLowConfidence: settings.handoverOnLowConfidence,
        businessRules: settings.businessRules,
        greetingMessage: settings.greetingMessage,
        aiPaused: settings.aiPaused,
        maxContextChunks: Number(settings.maxContextChunks),
        temperature: Number(settings.temperature),
      });
      setSettings(res.settings);
      toast.toast({ title: "AI settings saved", variant: "success" });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((s) => (s ? { ...s, [key]: value } : s));
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  }

  if (!settings) {
    return <Alert variant="error">{error ?? "Could not load AI settings"}</Alert>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Settings</h1>
          <p className="text-sm text-muted-foreground">
            Control how your AI assistant speaks, when it answers, and when it
            hands over to a human.
          </p>
        </div>
        <Button onClick={save} loading={saving}>
          <Save className="h-4 w-4" /> Save changes
        </Button>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {!configured && (
        <Alert variant="warning" title="OpenAI is not configured">
          AI replies are disabled until a server-side <code>OPENAI_API_KEY</code>{" "}
          is configured. Keys are never exposed to the browser.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4" /> Master controls
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Enable AI replies</p>
              <p className="text-xs text-muted-foreground">
                Automatically reply to new customer messages.
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onChange={(v) => update("enabled", v)}
              label="Enable AI"
            />
          </div>
          <div className="flex items-center justify-between border-t pt-4">
            <div>
              <p className="text-sm font-medium">Pause all AI (kill switch)</p>
              <p className="text-xs text-muted-foreground">
                Immediately stops all AI replies across every channel.
              </p>
            </div>
            <Switch
              checked={settings.aiPaused}
              onChange={(v) => update("aiPaused", v)}
              label="Pause AI"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personality & tone</CardTitle>
            <CardDescription>
              Sets the assistant persona for every conversation.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Personality" htmlFor="personality">
              <Textarea
                id="personality"
                className="min-h-[110px]"
                value={settings.personality}
                onChange={(e) => update("personality", e.target.value)}
                placeholder="Friendly, professional, and concise support agent for a fashion store."
              />
            </Field>
            <Field label="Tone" htmlFor="tone">
              <Select
                id="tone"
                value={settings.tone}
                onChange={(e) => update("tone", e.target.value)}
              >
                <option value="friendly">Friendly</option>
                <option value="professional">Professional</option>
                <option value="casual">Casual</option>
                <option value="formal">Formal</option>
              </Select>
            </Field>
            <Field label="Greeting message" htmlFor="greeting">
              <Input
                id="greeting"
                value={settings.greetingMessage}
                onChange={(e) => update("greetingMessage", e.target.value)}
              />
            </Field>
            <Field label="Model" htmlFor="model" hint="Use a capable model for best accuracy.">
              <Select
                id="model"
                value={settings.model}
                onChange={(e) => update("model", e.target.value)}
              >
                <option value="gpt-4o-mini">gpt-4o-mini (fast, low cost)</option>
                <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                <option value="gpt-4o">gpt-4o (highest quality)</option>
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Safety & handover</CardTitle>
            <CardDescription>
              Protect customers from incorrect or sensitive answers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Auto-detect language</p>
                <p className="text-xs text-muted-foreground">
                  Reply in Bangla or English matching the customer.
                </p>
              </div>
              <Switch
                checked={settings.autoDetectLanguage}
                onChange={(v) => update("autoDetectLanguage", v)}
                label="Auto language"
              />
            </div>
            <Field
              label={`Confidence threshold: ${Number(settings.confidenceThreshold).toFixed(2)}`}
              htmlFor="threshold"
              hint="Below this score, the AI hands over to a human."
            >
              <input
                id="threshold"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={Number(settings.confidenceThreshold)}
                onChange={(e) =>
                  update("confidenceThreshold", e.target.value)
                }
                className="w-full accent-primary"
              />
            </Field>
            <Field
              label={`Creativity: ${Number(settings.temperature).toFixed(2)}`}
              htmlFor="temp"
              hint="Lower is more precise and factual."
            >
              <input
                id="temp"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={Number(settings.temperature)}
                onChange={(e) => update("temperature", e.target.value)}
                className="w-full accent-primary"
              />
            </Field>
            <div className="flex items-center justify-between border-t pt-3">
              <div>
                <p className="text-sm font-medium">Handover on low confidence</p>
                <p className="text-xs text-muted-foreground">
                  Assign to a human when the AI is unsure.
                </p>
              </div>
              <Switch
                checked={settings.handoverOnLowConfidence}
                onChange={(v) => update("handoverOnLowConfidence", v)}
                label="Handover"
              />
            </div>
            <Field
              label="Context chunks per reply"
              htmlFor="chunks"
              hint="How many knowledge snippets the AI can use."
            >
              <Select
                id="chunks"
                value={String(settings.maxContextChunks)}
                onChange={(e) =>
                  update("maxContextChunks", Number(e.target.value))
                }
              >
                {[3, 4, 5, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" /> Business rules
          </CardTitle>
          <CardDescription>
            Hard rules the AI must always follow. It will never invent prices,
            policies, or availability beyond your knowledge base.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            className="min-h-[140px]"
            value={settings.businessRules}
            onChange={(e) => update("businessRules", e.target.value)}
            placeholder={`Examples:\n- Delivery inside Dhaka takes 2-3 business days.\n- We do not offer refunds after 7 days.\n- For bulk orders above 50 units, connect to a human.`}
          />
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            The AI only answers from your knowledge base and these rules. If it
            cannot find a supported answer, it escalates to your team.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
