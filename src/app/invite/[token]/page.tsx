"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Alert, Spinner } from "@/components/ui/misc";

export default function InvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [info, setInfo] = React.useState<{
    email: string;
    role: string;
    organizationName: string;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({ name: "", password: "" });
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch(
          `/api/team/invitations/accept?token=${encodeURIComponent(params.token)}`,
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error?.message ?? "Invalid invitation");
        } else {
          setInfo(data);
        }
      } catch {
        setError("Could not load invitation");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/team/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: params.token,
          name: form.name || undefined,
          password: form.password || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data?.error?.code === "account_exists") {
          router.push(`/login?next=/invite/${params.token}`);
          return;
        }
        setError(data?.error?.message ?? "Could not accept invitation");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Could not accept invitation");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/20 px-4">
      <div className="w-full max-w-md rounded-xl border bg-background p-8 shadow-sm">
        <h1 className="text-xl font-bold">Join {info?.organizationName ?? "workspace"}</h1>
        {info && (
          <p className="mt-1 text-sm text-muted-foreground">
            You have been invited as <span className="font-medium capitalize">{info.role}</span>{" "}
            ({info.email}).
          </p>
        )}

        {error && (
          <div className="mt-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        {info && !error && (
          <form onSubmit={accept} className="mt-6 space-y-4">
            <Field label="Your name" htmlFor="inv-name">
              <Input
                id="inv-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Your full name"
              />
            </Field>
            <Field
              label="Create a password"
              htmlFor="inv-pass"
              hint="If you already have an account, sign in first and reopen this link."
            >
              <Input
                id="inv-pass"
                type="password"
                required
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <Button type="submit" className="w-full" loading={busy}>
              Accept invitation
            </Button>
          </form>
        )}

        {error && (
          <Button
            variant="outline"
            className="mt-4 w-full"
            onClick={() => router.push("/login")}
          >
            Go to sign in
          </Button>
        )}
      </div>
    </div>
  );
}
