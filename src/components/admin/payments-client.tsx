"use client";

import * as React from "react";
import { Check, RefreshCcw, X } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, Spinner } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toaster";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";

type Payment = {
  id: string;
  provider: string;
  amount: string;
  currency: string;
  status: string;
  invoiceNumber: string;
  paidAt: string | null;
  createdAt: string;
  organizationId: string;
  organizationName: string;
  metadata: Record<string, unknown> | null;
};

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "outline"> = {
  completed: "success",
  pending: "warning",
  failed: "destructive",
  refunded: "outline",
};

export function AdminPaymentsClient() {
  const [payments, setPayments] = React.useState<Payment[]>([]);
  const [total, setTotal] = React.useState(0);
  const [status, setStatus] = React.useState("all");
  const [page, setPage] = React.useState(1);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [target, setTarget] = React.useState<{ payment: Payment; action: "refund" | "approve" | "reject" } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const toast = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "25" });
      if (status !== "all") params.set("status", status);
      const res = await api.get<{ payments: Payment[]; total: number }>(
        `/api/admin/payments?${params}`,
      );
      setPayments(res.payments);
      setTotal(res.total);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not load payments");
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  React.useEffect(() => {
    void load();
  }, [load]);

  async function confirm() {
    if (!target) return;
    setBusy(true);
    try {
      await api.post("/api/admin/payments", {
        paymentId: target.payment.id,
        action: target.action,
      });
      toast.toast({
        title:
          target.action === "refund"
            ? "Payment refunded"
            : target.action === "approve"
              ? "Payment approved and plan activated"
              : "Payment rejected",
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

  const planName = (p: Payment) =>
    (p.metadata as Record<string, unknown> | null)?.planName as string | undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">
            Platform-wide payment history and manual approvals.
          </p>
        </div>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-10 rounded-md border bg-background px-3 text-sm"
        >
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
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
                <TH>Invoice</TH>
                <TH>Workspace</TH>
                <TH>Plan</TH>
                <TH>Amount</TH>
                <TH>Provider</TH>
                <TH>Status</TH>
                <TH>Date</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {payments.map((p) => (
                <TR key={p.id}>
                  <TD className="font-mono text-xs">{p.invoiceNumber}</TD>
                  <TD>
                    <a
                      href={`/admin/tenants/${p.organizationId}`}
                      className="hover:underline"
                    >
                      {p.organizationName}
                    </a>
                  </TD>
                  <TD>{planName(p) ?? "-"}</TD>
                  <TD>{formatCurrency(p.amount, p.currency)}</TD>
                  <TD className="capitalize">{p.provider}</TD>
                  <TD>
                    <Badge variant={STATUS_VARIANT[p.status] ?? "outline"}>
                      {p.status}
                    </Badge>
                  </TD>
                  <TD className="text-muted-foreground">
                    {formatDate(p.paidAt ?? p.createdAt)}
                  </TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-1">
                      {p.status === "pending" && p.provider === "manual" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setTarget({ payment: p, action: "approve" })}
                          >
                            <Check className="h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setTarget({ payment: p, action: "reject" })}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : null}
                      {p.status === "completed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTarget({ payment: p, action: "refund" })}
                        >
                          <RefreshCcw className="h-3.5 w-3.5" /> Refund
                        </Button>
                      ) : null}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {payments.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No payments found.
            </p>
          ) : null}
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{formatNumber(total)} payments</span>
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
            disabled={page * 25 >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog
        open={!!target}
        onClose={() => setTarget(null)}
        title={
          target?.action === "refund"
            ? "Refund payment?"
            : target?.action === "approve"
              ? "Approve payment?"
              : "Reject payment?"
        }
        description={
          target?.action === "refund"
            ? "Marking as refunded does not automatically reverse the charge with the gateway. Process the refund in your gateway dashboard too."
            : target?.action === "approve"
              ? "This activates the selected plan for the workspace immediately."
              : "The workspace will remain on its current plan."
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setTarget(null)}>
              Cancel
            </Button>
            <Button
              variant={target?.action === "reject" ? "destructive" : "default"}
              onClick={confirm}
              disabled={busy}
            >
              {busy ? "Working..." : "Confirm"}
            </Button>
          </>
        }
      >
        {target ? (
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Invoice:</span>{" "}
              {target.payment.invoiceNumber}
            </p>
            <p>
              <span className="text-muted-foreground">Amount:</span>{" "}
              {formatCurrency(target.payment.amount, target.payment.currency)}
            </p>
            <p>
              <span className="text-muted-foreground">Workspace:</span>{" "}
              {target.payment.organizationName}
            </p>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
