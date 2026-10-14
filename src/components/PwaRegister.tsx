"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    // Office task panes use an embedded webview. A service worker can cache a
    // partial Next.js document there and cause Word's "Add-in Error" banner.
    if (window.Office) {
      void navigator.serviceWorker?.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => { void registration.unregister(); });
      });
      return;
    }
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      // Relative so it resolves under any deployment base path (GitHub Pages project sites, Capacitor, Electron).
      void navigator.serviceWorker.register("sw.js").catch(() => {
        // Offline support is progressive; the converter remains functional online.
      });
    }
  }, []);
  return null;
}
