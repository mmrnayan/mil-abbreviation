"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { deliverReports } from "@/utils/reportOutbox";

export function FeedbackDelivery() {
  useEffect(() => {
    let active = false;
    const send = () => {
      if (active || document.visibilityState === "hidden") return;
      active = true;
      void deliverReports().catch(() => undefined).finally(() => { active = false; });
    };
    send();
    let removeNative: (() => Promise<void>) | undefined;
    let disposed = false;
    if (Capacitor.isNativePlatform()) void import("@capacitor/app").then(async ({ App }) => {
      const listener = await App.addListener("appStateChange", ({ isActive }) => { if (isActive) send(); });
      if (disposed) await listener.remove(); else removeNative = () => listener.remove();
    }).catch(() => undefined);
    const timer = setInterval(send, 30000);
    window.addEventListener("online", send);
    window.addEventListener("sac-report-submitted", send);
    document.addEventListener("visibilitychange", send);
    return () => { disposed = true; void removeNative?.(); clearInterval(timer); window.removeEventListener("online", send); window.removeEventListener("sac-report-submitted", send); document.removeEventListener("visibilitychange", send); };
  }, []);
  return null;
}
