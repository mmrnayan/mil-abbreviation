"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Flag, Send, X } from "lucide-react";
import { buildConversionFeedback, type ConversionFeedbackSeed } from "@/utils/conversionFeedback";
import { enqueueReport, type ReportContact } from "@/utils/reportOutbox";
import { diagnoseReport } from "@/utils/reportDiagnosis";
import { useDataset } from "@/providers/DatasetProvider";

export const CONTACT_KEY = "sac:report-contact:v1";
export function ReportIssueWidget({ conversion, label, iconOnly = false }: { conversion?: ConversionFeedbackSeed; label?: string; iconOnly?: boolean }) {
  const dataset = useDataset();
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<ConversionFeedbackSeed>();
  const [expected, setExpected] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [introduction, setIntroduction] = useState("");
  const [remember, setRemember] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const reportId = useRef("");
  const headingId = useId();
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) setOpen(false);
      if (event.key !== "Tab" || !dialog) return;
      const controls = [...dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input, textarea, summary")].filter((el) => el.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); previous?.focus(); };
  }, [open, saving]);

  function showReport() {
    setSeed(conversion); setExpected(""); setMessage(""); setError("");
    reportId.current = crypto.randomUUID();
    try {
      const contact = JSON.parse(localStorage.getItem(CONTACT_KEY) ?? "{}") as ReportContact;
      setEmail(contact.email ?? ""); setIntroduction(contact.introduction ?? "");
      setRemember(Boolean(localStorage.getItem(CONTACT_KEY)));
    } catch { setEmail(""); setIntroduction(""); setRemember(false); }
    setOpen(true);
  }
  let preview;
  try { if (seed) preview = buildConversionFeedback(seed).context; } catch { /* Selection is required before submission. */ }

  async function submit() {
    if (saving || (!seed && !message.trim())) return;
    setSaving(true); setError("");
    try {
      const payload = seed ? buildConversionFeedback(seed, expected, message) : { category: "other", message: message.trim() };
      if ("context" in payload && dataset.dataset && dataset.overlay) payload.context.diagnosis = diagnoseReport(payload.context, dataset.dataset, dataset.overlay, dataset.version ?? "");
      const contact: ReportContact = { ...(email.trim() ? { email: email.trim() } : {}), ...(introduction.trim() ? { introduction: introduction.trim() } : {}) };
      await enqueueReport({ ...payload, id: reportId.current, createdAt: new Date().toISOString(), page: window.location.pathname, ...(Object.keys(contact).length ? { contact } : {}) });
      // Contact preferences are independent of the already committed report.
      try { if (remember) localStorage.setItem(CONTACT_KEY, JSON.stringify(contact)); else localStorage.removeItem(CONTACT_KEY); } catch { /* The report has already been saved. */ }
      setOpen(false); setToast("Report saved. It will send automatically when connected.");
      window.dispatchEvent(new Event("sac-report-submitted"));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The report could not be saved on this device."); }
    finally { setSaving(false); }
  }

  return <>
    <button type="button" onClick={showReport} className={conversion ? (iconOnly ? "flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-forest-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-500 active:bg-forest-100 dark:text-stone-400 dark:hover:bg-white/10 dark:active:bg-white/20" : "button-ghost min-h-11") : "fixed right-5 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-[90] inline-flex items-center gap-2 rounded-full bg-gold-400 px-4 py-3 text-sm font-bold text-forest-950 shadow-lg hover:bg-gold-300 lg:bottom-5"} aria-haspopup="dialog" aria-expanded={open} aria-label={iconOnly ? "Report this entry" : undefined}>{iconOnly ? <Flag className="h-4 w-4" aria-hidden="true" /> : <><Flag className="h-4 w-4" /> {label ?? (conversion ? "Report this" : "Report an issue")}</>}</button>
    {open && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-forest-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby={headingId}>
      <div ref={dialogRef} className="max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-[#14251f]">
        <div className="flex justify-between gap-3"><h2 id={headingId} className="text-xl font-bold">{seed ? "Report this word or phrase" : "Report an issue"}</h2><button type="button" disabled={saving} className="button-ghost" onClick={() => setOpen(false)} aria-label="Close report"><X className="h-5 w-5" /></button></div>
        <div className="mt-4 space-y-4 text-sm">
          {preview && <div className="rounded-xl border bg-forest-50 p-3 dark:border-white/10 dark:bg-white/5"><p className="form-label">Selected text</p><p className="break-words font-bold">{preview.selectedText}</p><p className="form-label mt-3">Sentence</p><p className="whitespace-pre-wrap break-words">{preview.input}</p><p className="form-label mt-3">Actual output</p><p className="whitespace-pre-wrap break-words">{preview.actual}</p></div>}
          {seed && <label className="block"><span className="form-label">Expected abbreviation or output (optional)</span><input className="form-control" value={expected} maxLength={10000} onChange={(e) => setExpected(e.target.value)} placeholder="You can report without knowing the answer" /></label>}
          <label className="block"><span className="form-label">{seed ? "Explanation (optional)" : "Describe the problem"}</span><textarea className="form-control" rows={2} maxLength={4000} value={message} onChange={(e) => setMessage(e.target.value)} /></label>
          <details className="rounded-xl border p-3 dark:border-white/10"><summary className="cursor-pointer font-semibold">Your details (optional)</summary><div className="mt-3 space-y-3"><label className="block"><span className="form-label">Email</span><input type="email" autoComplete="email" className="form-control" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} /></label><label className="block"><span className="form-label">Short introduction — BA number, rank, name</span><input className="form-control" value={introduction} maxLength={200} onChange={(e) => setIntroduction(e.target.value)} /></label><label className="flex items-center gap-2"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember these details on this device</label></div></details>
          <p className="text-xs text-slate-500 dark:text-stone-400">{seed ? "Only the displayed sentence, its output and diagnostic evidence" : "Your description"} will be sent to the app owner. Reports do not change approved data. Pending reports can be managed in Settings.</p>
          {error && <p role="alert" className="text-red-700 dark:text-red-300">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" className="button-ghost" disabled={saving} onClick={() => setOpen(false)}>Cancel</button><button data-submit type="button" className="button-primary" disabled={saving || (seed ? !preview : !message.trim())} onClick={() => void submit()}><Send className="h-4 w-4" /> {saving ? "Saving…" : "Submit report"}</button></div>
        </div>
      </div>
    </div>}
    {toast && <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] left-1/2 z-[110] w-[90%] max-w-xl -translate-x-1/2 rounded-xl bg-forest-800 px-5 py-3 text-sm font-semibold text-white shadow-xl lg:bottom-5" role="status">{toast}</div>}
  </>;
}
