"use client";

import * as React from "react";
import { Megaphone, Plus } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Field, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, Spinner } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { formatDateTime } from "@/lib/utils";

type Announcement = {
  id: string;
  title: string;
  body: string;
  level: string;
  active: boolean;
  createdAt: string;
};

export function AnnouncementsClient() {
  const [items, setItems] = React.useState<Announcement[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [level, setLevel] = React.useState("info");
  const [saving, setSaving] = React.useState(false);
  const toast = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ announcements: Announcement[] }>(
        "/api/admin/announcements",
      );
      setItems(res.announcements);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not load announcements",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post("/api/admin/announcements", { title, body, level });
      toast.toast({ title: "Announcement published", variant: "success" });
      setOpen(false);
      setTitle("");
      setBody("");
      setLevel("info");
      await load();
    } catch (err) {
      toast.toast({
        title: "Could not publish",
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(a: Announcement) {
    try {
      await api.patch("/api/admin/announcements", {
        id: a.id,
        active: !a.active,
      });
      await load();
    } catch (err) {
      toast.toast({
        title: "Could not update",
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: "error",
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Announcements</h1>
          <p className="text-sm text-muted-foreground">
            Banner shown to every workspace dashboard.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New announcement
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
      ) : items.length === 0 ? (
        <div className="rounded-lg border bg-background py-16 text-center">
          <Megaphone className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No announcements yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-background p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-medium">{a.title}</p>
                  <Badge variant={a.active ? "success" : "outline"}>
                    {a.active ? "Live" : "Hidden"}
                  </Badge>
                  <Badge variant={a.level === "warning" ? "warning" : "outline"}>
                    {a.level}
                  </Badge>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                  {a.body}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {formatDateTime(a.createdAt)}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => void toggle(a)}>
                {a.active ? "Hide" : "Publish"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New announcement"
        description="Shown as a dismissible banner in all dashboards."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} disabled={saving}>
              {saving ? "Publishing..." : "Publish"}
            </Button>
          </>
        }
      >
        <form onSubmit={create} className="space-y-3">
          <Field label="Title" htmlFor="ann-title">
            <Input
              id="ann-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </Field>
          <Field label="Body" htmlFor="ann-body">
            <Textarea
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              required
            />
          </Field>
          <Field label="Level" htmlFor="ann-level">
            <Select
              id="ann-level"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="success">Success</option>
            </Select>
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
