import Link from "next/link";
import { MessageSquare } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="flex flex-col justify-center px-6 py-12 sm:px-12">
        <Link href="/" className="mb-10 inline-flex items-center gap-2 self-start">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <MessageSquare className="h-5 w-5" />
          </span>
          <span className="text-lg font-bold">SupportPilot</span>
        </Link>
        <div className="mx-auto w-full max-w-md">{children}</div>
      </div>
      <div className="relative hidden overflow-hidden bg-slate-900 lg:flex lg:flex-col lg:justify-center lg:p-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.35),transparent_55%),radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.25),transparent_50%)]" />
        <div className="relative z-10 max-w-lg text-white">
          <h2 className="text-3xl font-bold leading-tight">
            Every customer conversation, one AI-powered inbox.
          </h2>
          <p className="mt-4 text-slate-300">
            Connect Messenger, Instagram, WhatsApp, Telegram, email, and your
            website widget. Let AI answer instantly in Bangla and English, and
            hand over to your team when it matters.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-4">
            {[
              ["6+", "Channels unified"],
              ["2", "Languages (BN/EN)"],
              ["24/7", "AI coverage"],
              ["100%", "Tenant isolated"],
            ].map(([stat, label]) => (
              <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-2xl font-bold">{stat}</p>
                <p className="text-sm text-slate-300">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
