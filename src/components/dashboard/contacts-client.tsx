"use client";

import * as React from "react";
import { Plus, Search, Download, Users, Pencil, Trash2 } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Dialog } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, Spinner } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/utils";

type Contact = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  tags: string[];
  notes: string | null;
  createdAt: string;
  conversationCount: number;
  channelTypes: string[];
};

const CHANNEL_LABELS: Record<string, string> = {
  website: "Website",
  telegram: "Telegram",
  facebook: "Messenger",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  gmail: "Gmail",
  outlook: "Outlook",
};

export function ContactsClient({ canManage }: { canManage: boolean }) {
  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [total, setTotal] = React.useState(0);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Contact | null>(null);
  const [form, setForm] = React.useState({
    name: "",
    email: "",
    phone: "",
    tags: "",
    notes: "",
  });
  const [saving, setSaving] = React.useState(false);
  const toast = useToast();
  const limit = 25;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search.trim()) q.set("q", search.trim());
      const res = await api.get<{ contacts: Contact[]; total: number }>(
        `/api/contacts?${q.toString()}`,
      );
      setContacts(res.contacts);
      setTotal(res.total);
    } catch (err) {
      toast.toast({
        title: "Failed to load contacts",
        description: err instanceof ApiClientError ? err.message : "Error",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [page, search, toast]);

  React.useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  function openCreate() {
    setEditing(null);
    setForm({ name: "", email: "", phone: "", tags: "", notes: "" });
    setDialogOpen(true);
  }

  function openEdit(c: Contact) {
    setEditing(c);
    setForm({
      name: c.name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      tags: c.tags.join(", "),
      notes: c.notes ?? "",
    });
    setDialogOpen(true);
  }

  async function save() {
    setSaving(true);
    try {
      const payload = {
        name: form.name || undefined,
        email: form.email || "",
        phone: form.phone || undefined,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 20),
        notes: form.notes || undefined,
      };
      if (editing) {
        await api.patch(`/api/contacts/${editing.id}`, payload);
      } else {
        await api.post("/api/contacts", payload);
      }
      setDialogOpen(false);
      await load();
      toast.toast({ title: editing ? "Contact updated" : "Contact created", variant: "success" });
    } catch (err) {
      toast.toast({
        title: "Save failed",
        description: err instanceof ApiClientError ? err.message : "Error",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Contact) {
    if (!confirm(`Delete contact "${c.name ?? c.email ?? "Unknown"}"? This cannot be undone.`)) return;
    try {
      await api.del(`/api/contacts/${c.id}`);
      await load();
      toast.toast({ title: "Contact deleted", variant: "success" });
    } catch (err) {
      toast.toast({
        title: "Delete failed",
        description: err instanceof ApiClientError ? err.message : "Error",
        variant: "error",
      });
    }
  }

  function exportCsv() {
    const header = ["Name", "Email", "Phone", "Tags", "Conversations", "Created"];
    const rows = contacts.map((c) => [
      c.name ?? "",
      c.email ?? "",
      c.phone ?? "",
      c.tags.join("; "),
      String(c.conversationCount),
      formatDate(c.createdAt),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Everyone who has contacted your business, across all channels.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={contacts.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          {canManage && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add contact
            </Button>
          )}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, email, or phone"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      <Card>
        {loading ? (
          <div className="flex justify-center p-12">
            <Spinner />
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="No contacts yet"
              description="Contacts are created automatically when customers message you, or you can add them manually."
              action={
                canManage ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus className="h-4 w-4" /> Add contact
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Contact</TH>
                  <TH>Channels</TH>
                  <TH>Tags</TH>
                  <TH>Conversations</TH>
                  <TH>Added</TH>
                  {canManage && <TH className="text-right">Actions</TH>}
                </TR>
              </THead>
              <TBody>
                {contacts.map((c) => (
                  <TR key={c.id}>
                    <TD>
                      <div className="flex items-center gap-2">
                        <Avatar name={c.name ?? c.email} size={32} />
                        <div>
                          <p className="text-sm font-medium">{c.name ?? "Unnamed"}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.email ?? c.phone ?? "No contact info"}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {c.channelTypes.length === 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          c.channelTypes.map((t) => (
                            <Badge key={t} variant="secondary">
                              {CHANNEL_LABELS[t] ?? t}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {c.tags.length === 0 ? (
                          <span className="text-xs text-muted-foreground">-</span>
                        ) : (
                          c.tags.map((t) => (
                            <Badge key={t} variant="outline">
                              {t}
                            </Badge>
                          ))
                        )}
                      </div>
                    </TD>
                    <TD className="text-sm">{c.conversationCount}</TD>
                    <TD className="text-xs text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </TD>
                    {canManage && (
                      <TD>
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(c)}
                            className="rounded p-1.5 hover:bg-muted"
                            aria-label="Edit contact"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => remove(c)}
                            className="rounded p-1.5 text-destructive hover:bg-muted"
                            aria-label="Delete contact"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </TD>
                    )}
                  </TR>
                ))}
              </TBody>
            </Table>
            <div className="flex items-center justify-between border-t p-3 text-sm">
              <span className="text-muted-foreground">
                {total} contact{total === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <span className="text-xs text-muted-foreground">
                  {page} / {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editing ? "Edit contact" : "Add contact"}
        description="Contact details are private to this workspace."
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name" htmlFor="c-name">
            <Input
              id="c-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="Email" htmlFor="c-email">
            <Input
              id="c-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Phone" htmlFor="c-phone">
            <Input
              id="c-phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="Tags" htmlFor="c-tags" hint="Comma-separated, e.g. vip, wholesale">
            <Input
              id="c-tags"
              value={form.tags}
              onChange={(e) => setForm({ ...form, tags: e.target.value })}
            />
          </Field>
          <Field label="Notes" htmlFor="c-notes">
            <Input
              id="c-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
