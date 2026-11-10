"use client";

import * as React from "react";
import {
  Upload,
  Link2,
  FileText,
  Trash2,
  BookOpen,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Field, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, Spinner, Alert } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toaster";
import { formatDateTime, formatNumber } from "@/lib/utils";

type Doc = {
  id: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  fileName: string | null;
  status: string;
  error: string | null;
  charCount: number;
  chunkCount: number;
  sizeBytes: number | null;
  createdAt: string;
};

export function KnowledgeClient() {
  const [docs, setDocs] = React.useState<Doc[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [storageUsed, setStorageUsed] = React.useState(0);
  const [storageLimit, setStorageLimit] = React.useState<number | null>(null);
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<"file" | "url" | "text">("file");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [urlForm, setUrlForm] = React.useState({ url: "", title: "" });
  const [textForm, setTextForm] = React.useState({ title: "", text: "" });
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<{
    document: Doc;
    chunks: Array<{ id: string; chunkIndex: number; content: string }>;
  } | null>(null);
  const toast = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{
        documents: Doc[];
        storageUsed: number;
        storageLimitMb: number | null;
      }>("/api/knowledge");
      setDocs(res.documents);
      setStorageUsed(res.storageUsed);
      setStorageLimit(res.storageLimitMb);
    } catch (err) {
      toast.toast({
        title: "Failed to load knowledge base",
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

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (mode === "file") {
        if (!file) {
          setError("Choose a PDF, DOCX, or TXT file first.");
          setBusy(false);
          return;
        }
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/knowledge", {
          method: "POST",
          body: fd,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new ApiClientError(
            data?.error?.message ?? "Upload failed",
            res.status,
          );
        }
      } else if (mode === "url") {
        await api.post("/api/knowledge", {
          sourceType: "url",
          url: urlForm.url,
          title: urlForm.title || undefined,
        });
      } else {
        await api.post("/api/knowledge", {
          sourceType: "text",
          text: textForm.text,
          title: textForm.title || undefined,
        });
      }
      setOpen(false);
      setFile(null);
      setUrlForm({ url: "", title: "" });
      setTextForm({ title: "", text: "" });
      await load();
      toast.toast({ title: "Knowledge source added", variant: "success" });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function remove(doc: Doc) {
    if (!confirm(`Delete "${doc.title}"? This removes its embeddings too.`)) return;
    try {
      await api.del(`/api/knowledge/${doc.id}`);
      await load();
      toast.toast({ title: "Document deleted", variant: "success" });
    } catch (err) {
      toast.toast({
        title: "Delete failed",
        description: err instanceof ApiClientError ? err.message : "Error",
        variant: "error",
      });
    }
  }

  async function openPreview(doc: Doc) {
    try {
      const res = await api.get<NonNullable<typeof preview>>(
        `/api/knowledge/${doc.id}`,
      );
      setPreview(res);
    } catch {
      toast.toast({ title: "Could not load document", variant: "error" });
    }
  }

  const pct =
    storageLimit && storageLimit > 0
      ? Math.min(100, Math.round((storageUsed / (storageLimit * 1024 * 1024)) * 100))
      : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">
            Teach the AI about your business. Upload documents, import pages, or
            write answers.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Upload className="h-4 w-4" /> Add source
        </Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Storage used</span>
            <span className="font-medium">
              {(storageUsed / (1024 * 1024)).toFixed(2)} MB
              {storageLimit ? ` / ${storageLimit} MB` : ""}
            </span>
          </div>
          {storageLimit && (
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && docs.some((d) => d.status === "failed" && d.error?.includes("OPENAI_API_KEY")) && (
        <Alert variant="warning" title="Embeddings not configured">
          Add <code>OPENAI_API_KEY</code> to your environment to enable semantic
          search. Documents will be re-indexed once the key is configured and you
          re-upload them.
        </Alert>
      )}

      <Card>
        {loading ? (
          <div className="flex justify-center p-12">
            <Spinner />
          </div>
        ) : docs.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<BookOpen className="h-8 w-8" />}
              title="No knowledge sources yet"
              description="Upload your FAQ, product catalog, policies, or import your website so the AI can answer accurately."
              action={
                <Button size="sm" onClick={() => setOpen(true)}>
                  <Upload className="h-4 w-4" /> Add your first source
                </Button>
              }
            />
          </div>
        ) : (
          <div className="divide-y">
            {docs.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  {doc.sourceType === "url" ? (
                    <Link2 className="h-4 w-4" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    onClick={() => openPreview(doc)}
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {doc.title}
                  </button>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="capitalize">{doc.sourceType}</span>
                    <span>·</span>
                    <span>{formatNumber(doc.chunkCount)} chunks</span>
                    <span>·</span>
                    <span>{formatDateTime(doc.createdAt)}</span>
                  </div>
                  {doc.status === "failed" && doc.error && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                      <AlertTriangle className="h-3 w-3" /> {doc.error}
                    </p>
                  )}
                </div>
                <Badge
                  variant={
                    doc.status === "ready"
                      ? "success"
                      : doc.status === "failed"
                        ? "destructive"
                        : "warning"
                  }
                >
                  {doc.status}
                </Badge>
                <button
                  onClick={() => remove(doc)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label="Delete document"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
        title="Add knowledge source"
        description="The content is chunked, embedded, and searched per workspace only."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Add source
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && <Alert variant="error">{error}</Alert>}
          <Tabs
            value={mode}
            onChange={(v) => setMode(v as typeof mode)}
            tabs={[
              { value: "file", label: "Upload file" },
              { value: "url", label: "Website" },
              { value: "text", label: "Write text" },
            ]}
          />
          {mode === "file" && (
            <div className="space-y-2">
              <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center hover:bg-muted/40">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="mt-2 text-sm font-medium">
                  {file ? file.name : "Choose a file"}
                </span>
                <span className="text-xs text-muted-foreground">
                  PDF, DOCX, or TXT up to 15 MB
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.txt,.md,.csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
          )}
          {mode === "url" && (
            <div className="space-y-3">
              <Field label="Page URL" htmlFor="k-url">
                <Input
                  id="k-url"
                  placeholder="https://example.com/faq"
                  value={urlForm.url}
                  onChange={(e) => setUrlForm({ ...urlForm, url: e.target.value })}
                />
              </Field>
              <Field label="Title (optional)" htmlFor="k-title">
                <Input
                  id="k-title"
                  value={urlForm.title}
                  onChange={(e) =>
                    setUrlForm({ ...urlForm, title: e.target.value })
                  }
                />
              </Field>
            </div>
          )}
          {mode === "text" && (
            <div className="space-y-3">
              <Field label="Title" htmlFor="k-tt">
                <Input
                  id="k-tt"
                  value={textForm.title}
                  onChange={(e) =>
                    setTextForm({ ...textForm, title: e.target.value })
                  }
                  placeholder="Shipping policy"
                />
              </Field>
              <Field label="Content" htmlFor="k-text">
                <Textarea
                  id="k-text"
                  className="min-h-[160px]"
                  value={textForm.text}
                  onChange={(e) =>
                    setTextForm({ ...textForm, text: e.target.value })
                  }
                  placeholder="Write the exact facts the AI should use..."
                />
              </Field>
            </div>
          )}
        </div>
      </Dialog>

      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview?.document.title ?? "Document"}
        className="max-w-2xl"
      >
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {preview?.chunks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This document has no indexed chunks yet.
            </p>
          ) : (
            preview?.chunks.map((c) => (
              <div key={c.id} className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  Chunk {c.chunkIndex + 1}
                </p>
                <p className="whitespace-pre-wrap text-sm">{c.content}</p>
              </div>
            ))
          )}
        </div>
      </Dialog>
    </div>
  );
}
