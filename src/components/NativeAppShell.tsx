"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { usePathname, useRouter } from "next/navigation";

/**
 * Native app chrome for the Capacitor builds: status-bar styling to match the
 * header and hardware back-button handling. No-ops on the web.
 */
export function NativeAppShell() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#0f2e24" });
      } catch { /* Older devices without the plugin keep system defaults. */ }
    })();
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => Promise<void>) | undefined;
    let disposed = false;
    void import("@capacitor/app").then(async ({ App }) => {
      const listener = await App.addListener("backButton", () => {
        if (pathname !== "/") router.push("/");
        else App.exitApp?.();
      });
      if (disposed) await listener.remove(); else remove = () => listener.remove();
    }).catch(() => undefined);
    return () => { disposed = true; void remove?.(); };
  }, [pathname, router]);

  return null;
}
