"use client";

import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { APP_VERSION } from "@/version";

export function AppFooter() {
  return (
    <footer className="mt-16 border-t bg-white/80 dark:border-white/10 dark:bg-[#111815]">
      <div className="page-shell flex flex-col gap-4 py-7 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between dark:text-stone-400">
        <div className="flex items-center gap-2">
          <LockKeyhole aria-hidden="true" className="h-4 w-4 text-forest-700 dark:text-gold-300" />
          <span>Conversion runs locally. Submitted reports include your text.</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span>Joint Services Staff Duties Manual 2022 — Service Writing</span>
          <span className="font-mono text-xs">v{APP_VERSION}</span>
          <Link className="font-medium hover:text-forest-700 dark:hover:text-gold-300" href="/about">Settings</Link>
        </div>
      </div>
    </footer>
  );
}
