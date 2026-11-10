import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: {
    default: "SupportPilot - AI Customer Support SaaS",
    template: "%s | SupportPilot",
  },
  description:
    "Multi-tenant AI customer support and business automation platform. Unify every channel, automate replies with AI, and grow your business.",
  manifest: "/manifest.webmanifest",
  applicationName: "SupportPilot",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SupportPilot" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
