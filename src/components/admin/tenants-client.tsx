"use client";

import * as React from "react";
import Link from "next/link";
import { Search, ShieldOff, ShieldCheck } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, Spinner } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { formatDate, formatNumber } from "@/lib/utils";

type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  website: string | null;
  createdAt: string;
  planName: string | null;
  planSlug: string | null;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  memberCount: number;
  conversationCount: number;
};

type TenantList = {
  tenants: Tenant[];
  total: number;
  page: number;
  pages: number;
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "outline"> = {
  active: "success",
  suspended: "warning",
  deleted: "outline",
};

export function TenantsClient() {
  const [data, setData] = React.useState<TenantList | null>(null);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [target, setTarget] = React.useState<Tenant | null>(null);
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      const res = await api.get<TenantList>(`/api/admin/tenants?${params}`);
      setData(res);
      setError(null);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not load workspaces",
      );
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  React.useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  async function setTenantStatus(t: Tenant, next: "active" | "suspended") {
    setBusy(true);
    try {
      await api.patch("/api/admin/tenants", { id: t.id, status: next });
      toast.toast({
        title: next === "active" ? "Workspace reinstated" : "Workspace suspended",
        variant: "success",
      });
      setTarget(null);
      await load();
    } catch (err) {
      toast.toast({
        title: "Action failed",
        description: err instanceof ApiClientError ? err.message : undefined,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Workspaces</h1>
        <p className="text-sm text-muted-foreground">
          All tenant organizations on the platform.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or slug"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {error ? (
        <Alert variant="error" title="Could not load">
          {error}
        </Alert>
      ) : null}

      {loading && !data ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <THead>
              <TR>
                <TH>Workspace</TH>
                <TH>Plan</TH>
                <TH>Members</TH>
                <TH>Conversations</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {(data?.tenants ?? []).map((t) => (
                <TR key={t.id}>
                  <TD>
                    <Link
                      href={`/admin/tenants/${t.id}`}
                      className="font-medium hover:underline"
                    >
                      {t.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{t.slug}</p>
                  </TD>
                  <TD>{t.planName ?? "No plan"}</TD>
                  <TD>{t.memberCount}</TD>
                  <TD>{formatNumber(t.conversationCount)}</TD>
                  <TD>
                    <Badge variant={STATUS_VARIANT[t.status] ?? "outline"}>
                      {t.status}
                    </Badge>
                  </TD>
                  <TD className="text-muted-foreground">{formatDate(t.createdAt)}</TD>
                  <TD className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setTarget(t)}
                    >
                      {t.status === "active" ? "Suspend" : "Reinstate"}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {(data?.tenants ?? []).length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No workspaces found.
            </p>
          ) : null}
        </div>
      )}

      {data && data.pages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {data.page} of {data.pages} · {formatNumber(data.total)} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={!!target}
        onClose={() => setTarget(null)}
        title={
          target?.status === "active" ? "Suspend workspace?" : "Reinstate workspace?"
        }
        description={
          target?.status === "active"
            ? `${target?.name} will immediately lose access to the dashboard and all channels.`
            : `${target?.name} will regain access to the dashboard.`
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={target?.status === "active" ? "destructive" : "default"}
              disabled={busy}
              onClick={() =>
                target &&
                void setTenantStatus(
                  target,
                  target.status === "active" ? "suspended" : "active",
                )
              }
            >
              {target?.status === "active" ? (
                <ShieldOff className="h-4 w-4" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              {busy
                ? "Working..."
                : target?.status === "active"
                  ? "Suspend"
                  : "Reinstate"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">
          This is logged in the platform audit trail.
        </p>
      </Dialog>
    </div>
  );
}
