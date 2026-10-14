"use client";

import { useEffect } from "react";

export const SAFE_BOTTOM_KEY = "sac:safe-bottom-mode:v1";
export type SafeBottomMode = "auto" | "gesture" | "buttons";

/**
 * Single runtime source for --safe-bottom. Auto mode combines the reported
 * safe-area inset, a 48px floor (Android 3-button bar) and the gap between
 * the visual viewport and the layout viewport/screen — some hosts report an
 * inset of 0 while still drawing the system buttons over the page.
 */
export function SafeBottom() {
  useEffect(() => {
    function readMode(): SafeBottomMode {
      try {
        const saved = localStorage.getItem(SAFE_BOTTOM_KEY);
        return saved === "gesture" || saved === "buttons" ? saved : "auto";
      } catch { return "auto"; }
    }

    function apply() {
      // Desktop hides the bottom nav; let the CSS media default (0px) rule.
      if (window.matchMedia("(min-width: 1024px)").matches) {
        document.documentElement.style.removeProperty("--safe-bottom");
        return;
      }
      const mode = readMode();
      if (mode === "gesture") {
        document.documentElement.style.setProperty("--safe-bottom", "16px");
        return;
      }
      if (mode === "buttons") {
        document.documentElement.style.setProperty("--safe-bottom", "48px");
        return;
      }
      // Auto: largest of the reported inset, a 48px 3-button floor, and a
      // measured gap below the visual viewport — only when that gap is
      // plausibly a system bar (24–160px); desktop monitors report huge gaps.
      const viewportGap = window.visualViewport
        ? Math.round(screen.height - (window.visualViewport.height + window.visualViewport.offsetTop))
        : 0;
      const systemBarGap = viewportGap >= 24 && viewportGap <= 160 ? viewportGap : 0;
      const floor = Math.max(48, systemBarGap);
      document.documentElement.style.setProperty("--safe-bottom", `max(env(safe-area-inset-bottom, 0px), ${floor}px)`);
    }

    function onStorageChange() { apply(); }
    apply();
    window.addEventListener("resize", onStorageChange);
    window.addEventListener("orientationchange", onStorageChange);
    window.addEventListener("sac-safe-bottom-change", onStorageChange);
    window.visualViewport?.addEventListener("resize", onStorageChange);
    return () => {
      window.removeEventListener("resize", onStorageChange);
      window.removeEventListener("orientationchange", onStorageChange);
      window.removeEventListener("sac-safe-bottom-change", onStorageChange);
      window.visualViewport?.removeEventListener("resize", onStorageChange);
    };
  }, []);
  return null;
}
