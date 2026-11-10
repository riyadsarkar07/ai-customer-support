"use client";

import * as React from "react";
import { UserPlus, Trash2, Copy, Check, Shield, Mail } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input, Field, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Avatar, Alert, Spinner } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useToast } from "@/components/ui/toaster";
import { formatDate } from "@/lib/utils";

type Member = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  status: string;
  joinedAt: string;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
};

const ROLE_PERMS: Record<string, string> = {
  owner: "Full access including billing and workspace deletion",
  admin: "Manage team, channels, AI, knowledge, and conversations",
  agent: "Handle conversations, contacts, and knowledge",
  viewer: "Read-only access to conversations and analytics",
};

export function TeamClient({ isOwner }: { isOwner: boolean }) {
  const [members, setMembers] = React.useState<Member[]>([]);
  const [invites, setInvites] = React.useState<Invite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("agent");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [createdLink, setCreatedLink] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const toast = useToast();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ members: Member[]; invitations: Invite[] }>(
        "/api/team",
      );
      setMembers(res.members);
      setInvites(res.invitations.filter((i) => !i.acceptedAt));
    } catch (err) {
      toast.toast({
        title: "Failed to load team",
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

  async function invite() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ acceptUrl: string }>("/api/team", {
        email,
        role,
      });
      setCreatedLink(`${window.location.origin}${res.acceptUrl}`);
      await load();
      toast.toast({ title: "Invitation created", variant: "success" });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Invite failed");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(member: Member, newRole: string) {
    try {
      await api.patch("/api/team", { userId: member.userId, role: newRole });
      setMembers((prev) =>
        prev.map((m) =>
          m.userId === member.userId ? { ...m, role: newRole } : m,
        ),
      );
      toast.toast({ title: "Role updated", variant: "success" });
    } catch (err) {
      toast.toast({
        title: "Could not update role",
        description: err instanceof ApiClientError ? err.message : "Error",
        variant: "error",
      });
    }
  }

  async function removeMember(member: Member) {
    if (!confirm(`Remove ${member.name} from this workspace?`)) return;
    try {
      await api.patch("/api/team", { userId: member.userId, remove: true });
      await load();
      toast.toast({ title: "Member removed", variant: "success" });
    } catch (err) {
      toast.toast({
        title: "Could not remove member",
        description: err instanceof ApiClientError ? err.message : "Error",
        variant: "error",
      });
    }
  }

  async function cancelInvite(invite: Invite) {
    try {
      await api.del(`/api/team?invitationId=${invite.id}`);
      setInvites((prev) => prev.filter((i) => i.id !== invite.id));
    } catch {
      toast.toast({ title: "Could not cancel invitation", variant: "error" });
    }
  }

  function copyLink() {
    if (!createdLink) return;
    void navigator.clipboard.writeText(createdLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Team</h1>
          <p className="text-sm text-muted-foreground">
            Invite teammates and control what they can access. Permissions are
            enforced on the server.
          </p>
        </div>
        <Button
          onClick={() => {
            setOpen(true);
            setCreatedLink(null);
            setError(null);
          }}
        >
          <UserPlus className="h-4 w-4" /> Invite teammate
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Members ({members.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH className="pl-6">Member</TH>
                <TH>Role</TH>
                <TH>Joined</TH>
                <TH className="pr-6 text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {members.map((m) => (
                <TR key={m.membershipId}>
                  <TD className="pl-6">
                    <div className="flex items-center gap-2">
                      <Avatar name={m.name} size={32} />
                      <div>
                        <p className="text-sm font-medium">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.email}</p>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    {m.role === "owner" ? (
                      <Badge className="gap-1">
                        <Shield className="h-3 w-3" /> Owner
                      </Badge>
                    ) : m.role === "admin" && !isOwner ? (
                      <Badge variant="secondary">Admin</Badge>
                    ) : (
                      <Select
                        value={m.role}
                        onChange={(e) => changeRole(m, e.target.value)}
                        className="h-8 w-28 text-xs"
                      >
                        <option value="admin">Admin</option>
                        <option value="agent">Agent</option>
                        <option value="viewer">Viewer</option>
                      </Select>
                    )}
                  </TD>
                  <TD className="text-xs text-muted-foreground">
                    {formatDate(m.joinedAt)}
                  </TD>
                  <TD className="pr-6 text-right">
                    {m.role !== "owner" && (
                      <button
                        onClick={() => removeMember(m)}
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                        aria-label="Remove member"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {invites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Pending invitations ({invites.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {invites.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm">{inv.email}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {inv.role} · expires {formatDate(inv.expiresAt)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => cancelInvite(inv)}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                  aria-label="Cancel invitation"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Roles & permissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {Object.entries(ROLE_PERMS).map(([r, desc]) => (
            <div key={r} className="flex items-start gap-2 text-sm">
              <Badge variant="outline" className="capitalize">
                {r}
              </Badge>
              <span className="text-muted-foreground">{desc}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Invite a teammate"
        description="Share the generated invite link with them. Links expire in 7 days."
        footer={
          createdLink ? (
            <Button onClick={() => setOpen(false)}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={invite} loading={busy} disabled={!email}>
                Create invitation
              </Button>
            </>
          )
        }
      >
        {createdLink ? (
          <div className="space-y-3">
            <Alert variant="success" title="Invitation created">
              Send this secure link to your teammate:
            </Alert>
            <div className="flex gap-2">
              <Input readOnly value={createdLink} className="text-xs" />
              <Button variant="outline" size="icon" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {error && <Alert variant="error">{error}</Alert>}
            <Field label="Email address" htmlFor="invite-email">
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
              />
            </Field>
            <Field label="Role" htmlFor="invite-role">
              <Select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                <option value="agent">Agent - handle conversations</option>
                <option value="viewer">Viewer - read only</option>
                {isOwner && <option value="admin">Admin - manage workspace</option>}
              </Select>
            </Field>
          </div>
        )}
      </Dialog>
    </div>
  );
}
