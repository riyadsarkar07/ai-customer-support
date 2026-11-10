import Link from "next/link";
import {
  MessageSquare,
  Bot,
  Inbox,
  Shield,
  Sparkles,
  Globe,
  BookOpen,
  Workflow,
  BarChart3,
  Languages,
  ArrowRight,
  Check,
} from "lucide-react";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/site-chrome";
import { buttonClasses } from "@/components/ui/button-styles";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

const channels = [
  { name: "Facebook Messenger", color: "bg-blue-600" },
  { name: "Instagram DM", color: "bg-pink-600" },
  { name: "WhatsApp", color: "bg-emerald-600" },
  { name: "Telegram", color: "bg-sky-600" },
  { name: "Gmail", color: "bg-red-600" },
  { name: "Outlook", color: "bg-indigo-600" },
  { name: "Website Chat", color: "bg-slate-700" },
];

const features = [
  {
    icon: Inbox,
    title: "Unified inbox",
    description:
      "Every channel in one place with assignments, priorities, tags, internal notes, and realtime updates.",
  },
  {
    icon: Bot,
    title: "AI that answers",
    description:
      "Context-aware replies from your own knowledge base, in Bangla and English, with confidence-based handover.",
  },
  {
    icon: BookOpen,
    title: "Knowledge base + RAG",
    description:
      "Upload PDF, DOCX, TXT or import a website. Chunked, embedded, and retrieved per workspace.",
  },
  {
    icon: Workflow,
    title: "Automation",
    description:
      "Rule-based workflows with triggers, conditions, delays, business hours, and retry logic.",
  },
  {
    icon: Shield,
    title: "Tenant isolation",
    description:
      "Every query is scoped to your workspace. Row-level checks on data, files, AI retrieval, and realtime.",
  },
  {
    icon: BarChart3,
    title: "Analytics",
    description:
      "Response times, AI deflection, channel volume, and AI usage cost tracked per tenant.",
  },
];

export default async function LandingPage() {
  let publicPlans: Array<{
    id: string;
    name: string;
    slug: string;
    description: string | null;
    price: string;
    currency: string;
    interval: string;
    features: string[];
    isPublic: boolean;
  }> = [];
  try {
    publicPlans = await db
      .select({
        id: plans.id,
        name: plans.name,
        slug: plans.slug,
        description: plans.description,
        price: plans.price,
        currency: plans.currency,
        interval: plans.interval,
        features: plans.features,
        isPublic: plans.isPublic,
      })
      .from(plans)
      .where(eq(plans.isPublic, true))
      .orderBy(asc(plans.sortOrder));
  } catch {
    publicPlans = [];
  }

  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />

      <main className="flex-1">
        <section className="relative overflow-hidden border-b">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,rgba(59,130,246,0.12),transparent_45%),radial-gradient(circle_at_80%_60%,rgba(16,185,129,0.10),transparent_45%)]" />
          <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:py-28">
            <span className="inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI support in Bangla and English
            </span>
            <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">
              Turn every customer message into a{" "}
              <span className="text-primary">resolved conversation</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              SupportPilot unifies your channels, answers instantly with your
              own business knowledge, and hands over to your team at exactly
              the right moment.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className={buttonClasses("default", "lg", "w-full sm:w-auto")}
              >
                Start free 14-day trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className={buttonClasses("outline", "lg", "w-full sm:w-auto")}
              >
                See pricing
              </Link>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No credit card required · Cancel anytime
            </p>

            <div className="mx-auto mt-14 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ["6+", "Channels"],
                ["BN/EN", "Languages"],
                ["RAG", "Knowledge AI"],
                ["RBAC", "Team roles"],
              ].map(([stat, label]) => (
                <div key={label} className="rounded-xl border bg-background p-4">
                  <p className="text-2xl font-bold">{stat}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-bold">Everything support teams need</h2>
            <p className="mt-2 text-muted-foreground">
              Built for real businesses, not demos. Every feature works end to end.
            </p>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-6 shadow-sm">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="channels" className="border-y bg-muted/30 py-16">
          <div className="mx-auto max-w-6xl px-4 text-center">
            <h2 className="text-3xl font-bold">Meet customers where they are</h2>
            <p className="mt-2 text-muted-foreground">
              Official platform APIs only. No scraping, no fake connections.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              {channels.map((c) => (
                <span
                  key={c.name}
                  className="inline-flex items-center gap-2 rounded-full border bg-background px-4 py-2 text-sm font-medium"
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${c.color}`} />
                  {c.name}
                </span>
              ))}
            </div>
            <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
              {[
                { icon: Languages, title: "Bilingual", text: "Detects and replies in Bangla or English automatically." },
                { icon: Globe, title: "Global ready", text: "Built with international readiness, optimized for Bangladesh payments." },
                { icon: Shield, title: "Secure by design", text: "Server-side keys, verified webhooks, and strict tenant boundaries." },
              ].map((i) => (
                <div key={i.title} className="rounded-xl border bg-background p-5 text-left">
                  <i.icon className="h-5 w-5 text-primary" />
                  <p className="mt-2 font-semibold">{i.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{i.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-20">
          <div className="text-center">
            <h2 className="text-3xl font-bold">Simple, transparent pricing</h2>
            <p className="mt-2 text-muted-foreground">
              Start free. Upgrade when your business grows.
            </p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {(publicPlans.length > 0
              ? publicPlans
              : [
                  { id: "starter", name: "Starter", slug: "starter", description: "For small businesses", price: "0", currency: "BDT", interval: "monthly", features: ["1 channel", "2 team members"], isPublic: true },
                  { id: "growth", name: "Growth", slug: "growth", description: "For growing teams", price: "2990", currency: "BDT", interval: "monthly", features: ["5 channels", "8 team members"], isPublic: true },
                  { id: "business", name: "Business", slug: "business", description: "For high volume", price: "7990", currency: "BDT", interval: "monthly", features: ["20 channels", "25 team members"], isPublic: true },
                ]
            ).map((plan) => (
              <div
                key={plan.id}
                className="flex flex-col rounded-xl border bg-card p-6 shadow-sm"
              >
                <h3 className="font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.description}
                </p>
                <p className="mt-4 text-3xl font-bold">
                  {Number(plan.price) === 0
                    ? "Free"
                    : formatCurrency(plan.price, plan.currency)}
                  {Number(plan.price) > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">
                      /{plan.interval === "monthly" ? "mo" : plan.interval}
                    </span>
                  )}
                </p>
                <ul className="mt-6 flex-1 space-y-2">
                  {(plan.features ?? []).map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {feat}
                    </li>
                  ))}
                </ul>
                <Link
                  href={`/register?plan=${plan.slug}`}
                  className={buttonClasses(
                    plan.slug === "growth" ? "default" : "outline",
                    "default",
                    "mt-6 w-full",
                  )}
                >
                  Get started
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t bg-slate-900 py-16 text-white">
          <div className="mx-auto max-w-3xl px-4 text-center">
            <MessageSquare className="mx-auto h-10 w-10 text-primary" />
            <h2 className="mt-4 text-3xl font-bold">
              Ready to automate your customer support?
            </h2>
            <p className="mt-2 text-slate-300">
              Launch your workspace in minutes and connect your first channel today.
            </p>
            <Link
              href="/register"
              className={buttonClasses("default", "lg", "mt-6")}
            >
              Create your workspace
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
