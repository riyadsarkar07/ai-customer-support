"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, Spinner } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime, formatNumber } from "@/lib/utils";

type Log = {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
  organizationId: string | null;
  organizationName: string | null;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
};

export function AuditClient({ initialOrgId }: { initialOrgId?: string }) {
  const [logs, setLogs] = React.useState<Log[]>([]);
  const [total, setTotal] = React.useState(0);
  const [action, setAction] = React.useState("");
  const [orgId, setOrgId] = React.useState(initialOrgId ?? "");
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "30" });
      if (action) params.set("action", action);
      if (orgId) params.set("organizationId", orgId);
      const res = await api.get<{ logs: Log[]; total: number }>(
        `/api/admin/audit?${params}`,
      );
      setLogs(res.logs);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load audit log");
    } finally {
      setLoading(false);
    }
  }, [page, action, orgId]);

  React.useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          Immutable record of workspace and platform actions.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by action (e.g. auth.login)"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="pl-9"
          />
        </div>
        <Input
          placeholder="Workspace ID (optional)"
          value={orgId}
          onChange={(e) => {
            setOrgId(e.target.value.trim());
            setPage(1);
          }}
          className="max-w-[320px] font-mono text-xs"
        />
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
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <THead>
              <TR>
                <TH>Time</TH>
                <TH>Action</TH>
                <TH>Actor</TH>
                <TH>Workspace</TH>
                <TH>Resource</TH>
                <TH>IP</TH>
              </TR>
            </THead>
            <TBody>
              {logs.map((l) => (
                <TR key={l.id}>
                  <TD className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(l.createdAt)}
                  </TD>
                  <TD className="font-mono text-xs">{l.action}</TD>
                  <TD className="text-xs">
                    {l.actorName ?? "System"}
                    {l.actorEmail ? (
                      <p className="text-muted-foreground">{l.actorEmail}</p>
                    ) : null}
                  </TD>
                  <TD className="text-xs">
                    {l.organizationName ?? "Platform"}
                  </TD>
                  <TD className="text-xs text-muted-foreground">
                    {l.resourceType ?? "-"}
                  </TD>
                  <TD className="text-xs text-muted-foreground">
                    {l.ipAddress ?? "-"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {logs.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No audit entries found.
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{formatNumber(total)} entries</span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page * 30 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
