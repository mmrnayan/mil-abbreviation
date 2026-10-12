"use client";

import Link from "next/link";
import { APP_VERSION } from "@/version";

export function AppFooter() {
  return (
    <footer className="mt-16 border-t bg-white/80 dark:border-white/10 dark:bg-[#111815]">
      <div className="page-shell flex flex-wrap items-center justify-between gap-3 py-5 text-sm text-slate-600 dark:text-stone-400">
        <span className="font-mono text-xs">v{APP_VERSION}</span>
        <Link className="font-medium hover:text-forest-700 dark:hover:text-gold-300" href="/about">Settings</Link>
      </div>
    </footer>
  );
}
