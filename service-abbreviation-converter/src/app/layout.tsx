import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import { PwaRegister } from "@/components/PwaRegister";
import { DatasetProvider } from "@/providers/DatasetProvider";

export const metadata: Metadata = {
  title: {
    default: "Service Abbreviation Converter",
    template: "%s · Service Abbreviation Converter",
  },
  description: "Bangladesh Services Writing Assistant for authorized full-form and abbreviation conversion.",
  applicationName: "Service Abbreviation Converter",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
        </DatasetProvider>
      </body>
    </html>
  );
}
