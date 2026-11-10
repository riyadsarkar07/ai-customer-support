import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Check } from "lucide-react";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/site-chrome";
import { buttonClasses } from "@/components/ui/button-styles";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { formatCurrency } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = { title: "Pricing" };

const fallbackPlans = [
  {
    id: "starter",
    name: "Starter",
    slug: "starter",
    description: "For small businesses getting started.",
    price: "0",
    currency: "BDT",
    interval: "monthly",
    features: ["1 channel", "2 team members", "500 conversations/mo", "300 AI replies/mo"],
  },
  {
    id: "growth",
    name: "Growth",
    slug: "growth",
    description: "For growing teams that need automation.",
    price: "2990",
    currency: "BDT",
    interval: "monthly",
    features: ["5 channels", "8 team members", "5,000 conversations/mo", "5,000 AI replies/mo", "Workflows"],
  },
  {
    id: "business",
    name: "Business",
    slug: "business",
    description: "For established businesses at scale.",
    price: "7990",
    currency: "BDT",
    interval: "monthly",
    features: ["20 channels", "25 team members", "25,000 conversations/mo", "30,000 AI replies/mo", "Custom roles"],
  },
];

export default async function PricingPage() {
  let list: typeof fallbackPlans = [];
  try {
    const rows = await db
      .select()
      .from(plans)
      .where(eq(plans.isPublic, true))
      .orderBy(asc(plans.sortOrder));
    list = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description ?? "",
      price: r.price,
      currency: r.currency,
      interval: r.interval,
      features: r.features,
    }));
  } catch {
    list = [];
  }
  if (list.length === 0) list = fallbackPlans;

  return (
    <div className="flex min-h-screen flex-col">
      <MarketingHeader />
      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 py-16 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight">
            Pricing that grows with you
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Every plan includes the unified inbox, AI replies, and knowledge
            base. Upgrade for more channels, teammates, and volume.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Prices in BDT. Pay with SSLCOMMERZ, bKash, or Nagad.
          </p>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="grid gap-6 md:grid-cols-3">
            {list.map((plan) => {
              const highlighted = plan.slug === "growth";
              return (
                <div
                  key={plan.id}
                  className={`relative flex flex-col rounded-2xl border bg-card p-7 shadow-sm ${
                    highlighted ? "border-primary ring-1 ring-primary" : ""
                  }`}
                >
                  {highlighted && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                      Most popular
                    </span>
                  )}
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  <p className="mt-1 min-h-[40px] text-sm text-muted-foreground">
                    {plan.description}
                  </p>
                  <p className="mt-4 text-4xl font-bold">
                    {Number(plan.price) === 0
                      ? "Free"
                      : formatCurrency(plan.price, plan.currency)}
                    {Number(plan.price) > 0 && (
                      <span className="text-sm font-normal text-muted-foreground">
                        /{plan.interval === "monthly" ? "mo" : plan.interval}
                      </span>
                    )}
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/register?plan=${plan.slug}`}
                    className={buttonClasses(
                      highlighted ? "default" : "outline",
                      "default",
                      "mt-7 w-full",
                    )}
                  >
                    Start free trial
                  </Link>
                </div>
              );
            })}
          </div>

          <div className="mt-12 rounded-xl border bg-muted/30 p-6">
            <h3 className="font-semibold">Payment methods</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              We support SSLCOMMERZ (cards, mobile banking, net banking), bKash
              Merchant API, and Nagad Merchant API. All payments are verified
              server-side and confirmed via signed callbacks. International
              providers can be enabled once eligibility is approved.
            </p>
          </div>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
