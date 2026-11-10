"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Search,
  Send,
  Bot,
  User,
  StickyNote,
  MoreVertical,
  CheckCheck,
  Loader2,
  ChevronLeft,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { useRealtime } from "@/components/dashboard/use-realtime";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Avatar, EmptyState, Spinner } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toaster";
import { cn, timeAgo, formatDateTime } from "@/lib/utils";

type Conversation = {
  id: string;
  status: "open" | "pending" | "resolved" | "archived";
  priority: "low" | "normal" | "high" | "urgent";
  channelType: string;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  unreadCount: number;
  aiEnabled: boolean;
  tags: string[];
  assigneeId: string | null;
  contactId: string;
  contactName: string | null;
  contactEmail: string | null;
  contactAvatar: string | null;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound";
  senderType: "contact" | "agent" | "ai" | "system";
  senderName: string | null;
  body: string;
  status: string;
  createdAt: string;
};

type Note = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string | null;
};

type Member = { id: string; name: string; email: string; role: string };

const CHANNEL_LABELS: Record<string, string> = {
  website: "Website",
  telegram: "Telegram",
  facebook: "Messenger",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  gmail: "Gmail",
  outlook: "Outlook",
};

export function InboxClient({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const params = useSearchParams();

  const [conversations, setConversations] = React.useState<Conversation[]>([]);
  const [counts, setCounts] = React.useState<Record<string, number>>({});
  const [loadingList, setLoadingList] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState("open");
  const [channelFilter, setChannelFilter] = React.useState("");
  const [assigneeFilter, setAssigneeFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [members, setMembers] = React.useState<Member[]>([]);
  const [channels, setChannels] = React.useState<
    Array<{ id: string; name: string; type: string }>
  >([]);

  const [activeId, setActiveId] = React.useState<string | null>(
    params.get("conversation"),
  );
  const [detail, setDetail] = React.useState<{
    conversation: Conversation;
    contact: { id: string; name: string | null; email: string | null; phone: string | null; tags: string[]; notes: string | null };
    channel: { id: string; name: string; type: string } | null;
    messages: Message[];
    notes: Note[];
    identities: Array<{ channelType: string; externalId: string; displayName: string | null }>;
    members: Member[];
  } | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);
  const [reply, setReply] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [noteMode, setNoteMode] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(true);
  const [mobileDetail, setMobileDetail] = React.useState(false);
  const toast = useToast();

  const messageEndRef = React.useRef<HTMLDivElement>(null);

  const loadList = React.useCallback(async () => {
    setListError(null);
    try {
      const query = new URLSearchParams();
      if (statusFilter) query.set("status", statusFilter);
      if (channelFilter) query.set("channel", channelFilter);
      if (assigneeFilter) query.set("assignee", assigneeFilter);
      if (search.trim()) query.set("q", search.trim());
      query.set("limit", "40");
      const res = await api.get<{
        conversations: Conversation[];
        counts: Record<string, number>;
        members: Member[];
        channels: Array<{ id: string; name: string; type: string }>;
      }>(`/api/conversations?${query.toString()}`);
      setConversations(res.conversations);
      setCounts(res.counts);
      setMembers(res.members);
      setChannels(res.channels);
    } catch (err) {
      setListError(
        err instanceof ApiClientError ? err.message : "Failed to load inbox",
      );
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter, channelFilter, assigneeFilter, search]);

  React.useEffect(() => {
    const t = setTimeout(loadList, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [loadList, search]);

  const loadDetail = React.useCallback(async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await api.get<NonNullable<typeof detail>>(
        `/api/conversations/${id}`,
      );
      setDetail(res);
      setActiveId(id);
    } catch (err) {
      toast.toast({
        title: "Could not open conversation",
        description:
          err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    } finally {
      setLoadingDetail(false);
    }
  }, [toast]);

  React.useEffect(() => {
    if (activeId) void loadDetail(activeId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  useRealtime((event) => {
    if (
      event.type === "message.created" ||
      event.type === "conversation.created" ||
      event.type === "conversation.updated"
    ) {
      void loadList();
      if (
        activeId &&
        "conversationId" in event &&
        event.conversationId === activeId &&
        !loadingDetail
      ) {
        void loadDetail(activeId);
      }
    }
  });

  React.useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length]);

  async function handleSend() {
    if (!activeId || !reply.trim() || sending) return;
    setSending(true);
    try {
      if (noteMode) {
        await api.post(`/api/conversations/${activeId}/notes`, {
          body: reply.trim(),
        });
      } else {
        const res = await api.post<{ status: string; error?: string }>(
          `/api/conversations/${activeId}/messages`,
          { body: reply.trim() },
        );
        if (res.status === "failed") {
          toast.toast({
            title: "Message could not be delivered",
            description: res.error ?? "Provider rejected the message",
            variant: "error",
          });
        }
      }
      setReply("");
      await loadDetail(activeId);
      await loadList();
    } catch (err) {
      toast.toast({
        title: "Send failed",
        description:
          err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    } finally {
      setSending(false);
    }
  }

  async function patchConversation(patch: Record<string, unknown>) {
    if (!activeId) return;
    try {
      await api.patch(`/api/conversations/${activeId}/status`, patch);
      await loadDetail(activeId);
      await loadList();
    } catch (err) {
      toast.toast({
        title: "Update failed",
        description:
          err instanceof ApiClientError ? err.message : "Unexpected error",
        variant: "error",
      });
    }
  }

  const totalOpen =
    (counts.open ?? 0) + (counts.pending ?? 0);

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-xl border bg-background">
      <div
        className={cn(
          "flex w-full flex-col border-r md:w-80 lg:w-96",
          mobileDetail && "hidden md:flex",
        )}
      >
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="mt-2 flex gap-1 overflow-x-auto">
            {[
              { value: "open", label: "Open" },
              { value: "pending", label: "Pending" },
              { value: "resolved", label: "Resolved" },
              { value: "archived", label: "Archived" },
              { value: "", label: "All" },
            ].map((s) => (
              <button
                key={s.value}
                onClick={() => setStatusFilter(s.value)}
                className={cn(
                  "whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
                  statusFilter === s.value
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80",
                )}
              >
                {s.label}
                {s.value === "open" && totalOpen > 0 ? ` (${totalOpen})` : ""}
              </button>
            ))}
          </div>
          {(channels.length > 1 || members.length > 1) && (
            <div className="mt-2 flex gap-2">
              {channels.length > 1 && (
                <Select
                  value={channelFilter}
                  onChange={(e) => setChannelFilter(e.target.value)}
                  className="h-8 text-xs"
                >
                  <option value="">All channels</option>
                  {channels.map((c) => (
                    <option key={c.id} value={c.type}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
              {members.length > 1 && (
                <Select
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                  className="h-8 text-xs"
                >
                  <option value="">Everyone</option>
                  <option value="me">Assigned to me</option>
                  <option value="unassigned">Unassigned</option>
                </Select>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loadingList ? (
            <div className="flex justify-center p-8">
              <Spinner />
            </div>
          ) : listError ? (
            <div className="p-4 text-center text-sm text-destructive">
              {listError}
            </div>
          ) : conversations.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="No conversations"
                description="When customers message your connected channels, they will appear here."
              />
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setActiveId(c.id);
                  setMobileDetail(true);
                }}
                className={cn(
                  "flex w-full items-start gap-3 border-b p-3 text-left transition-colors hover:bg-muted/50",
                  activeId === c.id && "bg-primary/5",
                )}
              >
                <Avatar name={c.contactName} src={c.contactAvatar} size={38} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">
                      {c.contactName ?? c.contactEmail ?? "Unknown"}
                    </p>
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {timeAgo(c.lastMessageAt)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.lastMessagePreview ?? "No messages"}
                  </p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {CHANNEL_LABELS[c.channelType] ?? c.channelType}
                    </span>
                    {c.priority !== "normal" && (
                      <Badge
                        variant={c.priority === "urgent" ? "destructive" : "warning"}
                        className="px-1.5 py-0 text-[10px]"
                      >
                        {c.priority}
                      </Badge>
                    )}
                    {c.unreadCount > 0 && (
                      <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          !mobileDetail && "hidden md:flex",
        )}
      >
        {!activeId ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={<Send className="h-8 w-8" />}
              title="Select a conversation"
              description="Choose a conversation from the list to view messages and reply."
            />
          </div>
        ) : loadingDetail && !detail ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : detail ? (
          <>
            <div className="flex items-center justify-between border-b p-3">
              <div className="flex min-w-0 items-center gap-2">
                <button
                  className="md:hidden"
                  onClick={() => setMobileDetail(false)}
                  aria-label="Back"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <Avatar name={detail.contact.name} size={36} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {detail.contact.name ?? "Unknown contact"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {detail.channel
                      ? `${CHANNEL_LABELS[detail.channel.type] ?? detail.channel.type} · ${detail.channel.name}`
                      : "Channel unavailable"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowDetails((v) => !v)}
                  className="rounded-md p-2 hover:bg-muted"
                  aria-label="Toggle details"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 min-h-0">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {detail.messages.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      No messages yet.
                    </p>
                  ) : (
                    detail.messages.map((m) => {
                      const outbound = m.direction === "outbound";
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "flex",
                            outbound ? "justify-end" : "justify-start",
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm",
                              outbound
                                ? m.senderType === "ai"
                                  ? "bg-primary/10 text-foreground"
                                  : m.senderType === "system"
                                    ? "bg-muted text-muted-foreground"
                                    : "bg-primary text-primary-foreground"
                                : "bg-muted",
                            )}
                          >
                            {outbound && (
                              <div
                                className={cn(
                                  "mb-0.5 flex items-center gap-1 text-[10px] font-medium",
                                  m.senderType === "agent"
                                    ? "text-primary-foreground/80"
                                    : "text-muted-foreground",
                                )}
                              >
                                {m.senderType === "ai" ? (
                                  <>
                                    <Bot className="h-3 w-3" /> AI
                                  </>
                                ) : m.senderType === "system" ? (
                                  "System"
                                ) : (
                                  <>
                                    <User className="h-3 w-3" />
                                    {m.senderName ?? "Agent"}
                                  </>
                                )}
                              </div>
                            )}
                            <p className="whitespace-pre-wrap break-words">
                              {m.body}
                            </p>
                            <div
                              className={cn(
                                "mt-1 flex items-center justify-end gap-1 text-[10px]",
                                outbound && m.senderType === "agent"
                                  ? "text-primary-foreground/70"
                                  : "text-muted-foreground",
                              )}
                            >
                              {formatDateTime(m.createdAt)}
                              {outbound &&
                                (m.status === "failed" ? (
                                  <span className="text-red-200">failed</span>
                                ) : (
                                  <CheckCheck className="h-3 w-3" />
                                ))}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messageEndRef} />
                </div>

                {canManage && (
                  <div className="border-t p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <button
                        onClick={() => setNoteMode(false)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium",
                          !noteMode
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        Reply
                      </button>
                      <button
                        onClick={() => setNoteMode(true)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium",
                          noteMode
                            ? "bg-amber-500 text-white"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        <StickyNote className="h-3 w-3" /> Internal note
                      </button>
                      {detail.conversation.aiEnabled ? (
                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-600">
                          <Bot className="h-3 w-3" /> AI active
                        </span>
                      ) : (
                        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Bot className="h-3 w-3" /> AI paused
                        </span>
                      )}
                    </div>
                    <div className="flex items-end gap-2">
                      <Textarea
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder={
                          noteMode
                            ? "Add an internal note (not sent to customer)..."
                            : "Type your reply..."
                        }
                        className="min-h-[44px] max-h-32 resize-none"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            void handleSend();
                          }
                        }}
                      />
                      <Button
                        onClick={handleSend}
                        loading={sending}
                        disabled={!reply.trim()}
                        size="icon"
                        aria-label="Send message"
                      >
                        {!sending && <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {showDetails && (
                <div className="hidden w-64 shrink-0 overflow-y-auto border-l p-4 lg:block">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    Contact
                  </p>
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="font-medium">{detail.contact.name ?? "-"}</p>
                    {detail.contact.email && (
                      <p className="break-all text-xs text-muted-foreground">
                        {detail.contact.email}
                      </p>
                    )}
                    {detail.contact.phone && (
                      <p className="text-xs text-muted-foreground">
                        {detail.contact.phone}
                      </p>
                    )}
                  </div>

                  {detail.identities.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Identities
                      </p>
                      <div className="mt-1 space-y-1">
                        {detail.identities.map((i) => (
                          <p
                            key={`${i.channelType}-${i.externalId}`}
                            className="truncate text-xs text-muted-foreground"
                          >
                            {CHANNEL_LABELS[i.channelType] ?? i.channelType}:{" "}
                            {i.displayName ?? i.externalId}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {canManage && (
                    <>
                      <div className="mt-4 space-y-2">
                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Status
                        </p>
                        <Select
                          value={detail.conversation.status}
                          onChange={(e) =>
                            void patchConversation({ status: e.target.value })
                          }
                          className="h-8 text-xs"
                        >
                          <option value="open">Open</option>
                          <option value="pending">Pending</option>
                          <option value="resolved">Resolved</option>
                          <option value="archived">Archived</option>
                        </Select>

                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Priority
                        </p>
                        <Select
                          value={detail.conversation.priority}
                          onChange={(e) =>
                            void patchConversation({ priority: e.target.value })
                          }
                          className="h-8 text-xs"
                        >
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </Select>

                        <p className="text-xs font-semibold uppercase text-muted-foreground">
                          Assignee
                        </p>
                        <Select
                          value={detail.conversation.assigneeId ?? ""}
                          onChange={(e) =>
                            void patchConversation({
                              assigneeId: e.target.value || null,
                            })
                          }
                          className="h-8 text-xs"
                        >
                          <option value="">Unassigned</option>
                          {detail.members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </Select>

                        <div className="flex items-center justify-between pt-2">
                          <span className="text-xs font-medium">AI replies</span>
                          <Switch
                            checked={detail.conversation.aiEnabled}
                            onChange={(v) =>
                              void patchConversation({ aiEnabled: v })
                            }
                            label="Toggle AI"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Internal notes
                    </p>
                    <div className="mt-1 space-y-2">
                      {detail.notes.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          No notes yet.
                        </p>
                      ) : (
                        detail.notes.map((n) => (
                          <div
                            key={n.id}
                            className="rounded-md bg-amber-50 p-2 text-xs text-amber-900"
                          >
                            <p className="whitespace-pre-wrap">{n.body}</p>
                            <p className="mt-1 text-[10px] opacity-70">
                              {n.authorName ?? "Unknown"} · {timeAgo(n.createdAt)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        )}
      </div>
    </div>
  );
}
