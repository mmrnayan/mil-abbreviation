import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { PwaRegister } from "@/components/PwaRegister";
import { ReportIssueWidget } from "@/components/ReportIssueWidget";
import { DatasetProvider } from "@/providers/DatasetProvider";
import { FeedbackDelivery } from "@/components/FeedbackDelivery";

// Deployment base path (set by the consumer build for subpath hosting such as GitHub Pages project sites).
const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const withBase = (path: string) => base + path;

export const metadata: Metadata = {
  title: {
    default: "Abbreviation Converter",
    template: "%s · Abbreviation Converter",
  },
  description:
    "Authorized abbreviation conversion based on the Joint Services Staff Duties Manual 2022 (Service Writing).",
  applicationName: "Abbreviation Converter",
  manifest: withBase("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Abbreviations",
  },
  icons: {
    icon: [
      { url: withBase("/icons/army.png"), type: "image/png" },
      { url: withBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png" },
      { url: withBase("/icons/icon-512.png"), sizes: "512x512", type: "image/png" },
    ],
    apple: withBase("/icons/army.png"),
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#173e32" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1b16" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <DatasetProvider>
          <div className="flex min-h-screen flex-col">
            <AppHeader />
            <main id="main-content" className="flex-1">{children}</main>
            <AppFooter />
          </div>
          <PwaRegister />
          <FeedbackDelivery />
          <ReportIssueWidget />
        </DatasetProvider>
      </body>
    </html>
  );
}
