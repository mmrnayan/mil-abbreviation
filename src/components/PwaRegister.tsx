"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      // Relative so it resolves under any deployment base path (GitHub Pages project sites, Capacitor, Electron).
      void navigator.serviceWorker.register("sw.js").catch(() => {
        // Offline support is progressive; the converter remains functional online.
      });
    }
  }, []);
  return null;
}
