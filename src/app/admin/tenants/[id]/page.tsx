import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPlatformAdmin } from "@/lib/auth/platform";
import { getTenantDetail } from "@/lib/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button-styles";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await getPlatformAdmin();
  if (!admin) redirect("/login");

  const { id } = await params;
  const detail = await getTenantDetail(id);
  if (!detail) notFound();

  const { organization, plan, subscription, members, payments, counts } = detail;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/tenants"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> All workspaces
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{organization.name}</h1>
            <p className="text-sm text-muted-foreground">
              {organization.slug} · {organization.id}
            </p>
          </div>
          <Badge
            variant={
              organization.status === "active"
                ? "success"
                : organization.status === "suspended"
                  ? "warning"
                  : "outline"
            }
          >
            {organization.status}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Plan" value={plan?.name ?? "None"} hint={subscription?.status} />
        <Stat label="Members" value={formatNumber(members.length)} />
        <Stat
          label="Conversations"
          value={formatNumber(counts.conversations)}
          hint={`${formatNumber(counts.messages)} messages`}
        />
        <Stat
          label="Renews"
          value={
            subscription?.currentPeriodEnd
              ? formatDate(subscription.currentPeriodEnd)
              : "-"
          }
          hint={subscription?.cancelAtPeriodEnd ? "Will not renew" : undefined}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Website" value={organization.website ?? "-"} />
            <Row label="Timezone" value={organization.timezone} />
            <Row label="Locale" value={organization.locale} />
            <Row label="Currency" value={organization.currency} />
            <Row label="Onboarded" value={organization.onboardingCompleted ? "Yes" : "No"} />
            <Row label="Created" value={formatDateTime(organization.createdAt)} />
            <Row
              label="Trial ends"
              value={organization.trialEndsAt ? formatDate(organization.trialEndsAt) : "-"}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Members</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {members.map((m) => (
                  <TR key={m.id}>
                    <TD>
                      <p className="font-medium">{m.name}</p>
                      <p className="text-xs text-muted-foreground">{m.email}</p>
                    </TD>
                    <TD className="capitalize">{m.role}</TD>
                    <TD>
                      <Badge variant={m.status === "active" ? "success" : "outline"}>
                        {m.status}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No payments recorded.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Provider</TH>
                  <TH>Amount</TH>
                  <TH>Status</TH>
                  <TH>Date</TH>
                </TR>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono text-xs">{p.invoiceNumber}</TD>
                    <TD className="capitalize">{p.provider}</TD>
                    <TD>{formatCurrency(p.amount, p.currency)}</TD>
                    <TD>{p.status}</TD>
                    <TD className="text-muted-foreground">
                      {formatDate(p.paidAt ?? p.createdAt)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div>
        <Link
          href={`/admin/audit?organizationId=${organization.id}`}
          className={buttonClasses("outline", "sm")}
        >
          View audit log for this workspace
        </Link>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | null;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
