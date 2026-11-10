"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Inbox,
  Users,
  BookOpen,
  Sparkles,
  Workflow,
  UserCog,
  Plug,
  BarChart3,
  CreditCard,
  Settings,
  MessageSquare,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronDown,
  ShieldCheck,
  Megaphone,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { Avatar } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";

type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  permission?: string;
  badge?: number;
};

const NAV: NavItem[] = [
  { href: "/dashboard/inbox", label: "Inbox", icon: Inbox, permission: "conversation.view" },
  { href: "/dashboard/contacts", label: "Contacts", icon: Users, permission: "contact.view" },
  { href: "/dashboard/knowledge", label: "Knowledge Base", icon: BookOpen, permission: "knowledge.manage" },
  { href: "/dashboard/ai", label: "AI Settings", icon: Sparkles, permission: "ai.manage" },
  { href: "/dashboard/automations", label: "Automations", icon: Workflow, permission: "workflow.manage" },
  { href: "/dashboard/team", label: "Team", icon: UserCog, permission: "team.manage" },
  { href: "/dashboard/integrations", label: "Integrations", icon: Plug, permission: "channel.manage" },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, permission: "analytics.view" },
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard, permission: "billing.manage" },
  { href: "/dashboard/settings", label: "Settings", icon: Settings, permission: "org.manage" },
];

export type DashboardUser = {
  id: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
};

export function DashboardShell({
  user,
  organization,
  membership,
  permissions,
  announcement,
  children,
}: {
  user: DashboardUser;
  organization: { id: string; name: string; slug: string };
  membership: { role: string };
  permissions: string[];
  announcement: { title: string; body: string; level: string } | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [noticeDismissed, setNoticeDismissed] = React.useState(false);

  const items = NAV.filter(
    (item) => !item.permission || permissions.includes(item.permission),
  );

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  async function logout() {
    await api.post("/api/auth/logout").catch(() => undefined);
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-muted/20">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-background transition-transform lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <MessageSquare className="h-4 w-4" />
            </span>
            <span className="text-sm font-bold">SupportPilot</span>
          </Link>
          <button
            className="lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="border-b p-3">
          <div className="rounded-lg bg-muted/60 px-3 py-2">
            <p className="truncate text-sm font-semibold">{organization.name}</p>
            <p className="text-xs capitalize text-muted-foreground">
              {membership.role} · {organization.slug}
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive(item.href)
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}

          {user.isPlatformAdmin && (
            <Link
              href="/admin"
              className="mt-2 flex items-center gap-3 rounded-lg border border-dashed px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ShieldCheck className="h-4 w-4" />
              Super Admin
            </Link>
          )}
        </nav>

        <div className="border-t p-3">
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-muted"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <Avatar name={user.name} size={32} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user.email}
                </p>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            </button>
            {menuOpen && (
              <div className="absolute bottom-full left-0 mb-1 w-full rounded-lg border bg-background p-1 shadow-lg">
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <div className="flex w-full flex-col lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/80 px-4 backdrop-blur">
          <button
            className="rounded-md p-2 hover:bg-muted lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="hidden text-sm text-muted-foreground lg:block">
            {organization.name} workspace
          </div>
          <div className="flex items-center gap-3">
            <NotificationsBell />
            <Badge variant="secondary" className="hidden capitalize sm:inline-flex">
              {membership.role}
            </Badge>
            <Avatar name={user.name} size={30} />
          </div>
        </header>

        {announcement && !noticeDismissed && (
          <div className="flex items-start gap-3 border-b bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            <Megaphone className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <span className="font-semibold">{announcement.title}: </span>
              {announcement.body}
            </div>
            <button
              onClick={() => setNoticeDismissed(true)}
              aria-label="Dismiss announcement"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function NotificationsBell() {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState<
    Array<{ id: string; title: string; body: string | null; link: string | null; readAt: string | null }>
  >([]);
  const unread = items.filter((i) => !i.readAt).length;

  const load = React.useCallback(async () => {
    try {
      const res = await api.get<{ notifications: typeof items }>(
        "/api/notifications",
      );
      setItems(res.notifications);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    void load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function markAllRead() {
    await api.post("/api/notifications/read").catch(() => undefined);
    setItems((prev) => prev.map((i) => ({ ...i, readAt: new Date().toISOString() })));
  }

  return (
    <div className="relative">
      <button
        className="relative rounded-md p-2 hover:bg-muted"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-80 rounded-lg border bg-background shadow-lg">
          <div className="flex items-center justify-between border-b p-3">
            <p className="text-sm font-semibold">Notifications</p>
            <button
              onClick={markAllRead}
              className="text-xs text-primary hover:underline"
            >
              Mark all read
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">
                No notifications yet
              </p>
            ) : (
              items.map((n) => (
                <Link
                  key={n.id}
                  href={n.link ?? "#"}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "block border-b p-3 text-sm last:border-0 hover:bg-muted",
                    !n.readAt && "bg-primary/5",
                  )}
                >
                  <p className="font-medium">{n.title}</p>
                  {n.body && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                  )}
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
