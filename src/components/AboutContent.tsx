"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useDataset } from "@/providers/DatasetProvider";
import { PendingReports } from "./PendingReports";
import { CONTACT_KEY } from "./ReportIssueWidget";
import { APP_VERSION } from "@/version";
import { Capacitor } from "@capacitor/core";

export function AboutContent() {
  const dataset = useDataset();
  const [online, setOnline] = useState(true);
  const [email, setEmail] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [message, setMessage] = useState("");
  const [dark, setDark] = useState(false);
  const [native, setNative] = useState(false);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update(); window.addEventListener("online", update); window.addEventListener("offline", update);
    setDark(document.documentElement.classList.contains("dark"));
    setNative(Capacitor.isNativePlatform() || window.location.protocol === "sac:");
    try { const saved = JSON.parse(localStorage.getItem(CONTACT_KEY) ?? "{}"); setEmail(saved.email ?? ""); setIntroduction(saved.introduction ?? ""); } catch { /* Optional contact details. */ }
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return <div className="page-shell space-y-5 py-8">
    <p className="text-sm text-slate-600 dark:text-stone-400">App v{APP_VERSION} · Developed by Maj Mizan</p>
    <section className="surface-card p-5"><h2 className="text-xl font-bold">Appearance</h2><label className="mt-3 flex gap-2"><input type="checkbox" checked={dark} onChange={(e) => { setDark(e.target.checked); document.documentElement.classList.toggle("dark", e.target.checked); localStorage.setItem("sac:theme", e.target.checked ? "dark" : "light"); }} /> Dark appearance</label></section>
    <section className="surface-card p-5"><h2 className="text-xl font-bold">Offline status and updates</h2>{native && !process.env.NEXT_PUBLIC_SERVICE_ORIGIN && <p className="mt-2 text-sm text-amber-800 dark:text-amber-200">Online delivery is not configured for this build. You can export submitted reports below.</p>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" className="button-secondary" disabled={dataset.updating || !online} onClick={() => void dataset.checkUpdates()}>Check approved updates</button><button type="button" className="button-ghost" disabled={dataset.updating} onClick={() => void dataset.restorePrevious()}>Restore previous dataset</button></div>{dataset.updateMessage && <p className="mt-3 text-sm" role="status">{dataset.updateMessage}</p>}</section>
    <section className="surface-card p-5"><h2 className="text-xl font-bold">Optional contact details</h2><p className="mt-2 text-sm text-slate-600 dark:text-stone-400">Stored on this device only; included in reports you submit.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label><span className="form-label">Email</span><input type="email" className="form-control" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></label><label><span className="form-label">Short introduction — BA number, rank, name</span><input className="form-control" maxLength={200} value={introduction} onChange={(e) => setIntroduction(e.target.value)} /></label></div><div className="mt-3 flex gap-2"><button type="button" className="button-secondary" onClick={() => { try { localStorage.setItem(CONTACT_KEY, JSON.stringify({ email: email.trim(), introduction: introduction.trim() })); setMessage("Details saved on this device."); } catch { setMessage("Could not save details on this device."); } }}>Remember my details</button><button type="button" className="button-ghost" onClick={() => { localStorage.removeItem(CONTACT_KEY); setEmail(""); setIntroduction(""); setMessage("Saved details removed. Already submitted reports are unchanged."); }}>Forget details</button></div>{message && <p role="status" className="mt-3 text-sm">{message}</p>}</section>
    <PendingReports />
    {process.env.NEXT_PUBLIC_OWNER_WORKSPACE === "1" && <section className="surface-card p-5"><h2 className="text-xl font-bold">Local owner workspace</h2><div className="mt-3 flex flex-wrap gap-3"><Link href="/feedback" className="button-secondary">Issue reports</Link><Link href="/review" className="button-secondary">Correction review</Link><Link href="/diagnostics" className="button-secondary">Diagnostics</Link></div></section>}
  </div>;
}
