"use client";

import Link from "next/link";
import { AlertTriangle, Database, LoaderCircle, RotateCw } from "lucide-react";
import { useDataset } from "@/providers/DatasetProvider";

export function DatasetStatusPanel() {
  const { status, error, validation } = useDataset();

  if (status === "loading") {
    return (
      <div className="surface-card mx-auto my-16 max-w-xl p-8 text-center" role="status">
        <LoaderCircle className="mx-auto h-9 w-9 animate-spin text-forest-700 dark:text-gold-300" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-bold">Preparing the authorized dataset</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-stone-400">
          Validating schema 1.1.0 and building the local matching index…
        </p>
      </div>
    );
  }

  if (status === "invalid" || status === "error") {
    const errors = validation?.diagnostics.filter((item) => item.severity === "error") ?? [];
    return (
      <div className="surface-card mx-auto my-16 max-w-2xl overflow-hidden" role="alert">
        <div className="border-b border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-red-700 dark:text-red-300" aria-hidden="true" />
            <div>
              <p className="eyebrow !text-red-700 dark:!text-red-300">Dataset unavailable</p>
              <h2 className="mt-1 text-xl font-bold">Conversion has been stopped safely</h2>
              <p className="mt-2 text-sm text-red-900/80 dark:text-red-100/80">
                {error ?? "The bundled dataset did not pass startup validation."}
              </p>
            </div>
          </div>
        </div>
        <div className="p-6">
          {errors.length > 0 && (
            <ul className="space-y-2 text-sm">
              {errors.slice(0, 5).map((item, index) => (
                <li key={`${item.code}-${index}`} className="rounded-lg bg-slate-50 p-3 dark:bg-white/5">
                  <strong>{item.code}</strong>: {item.message}
                </li>
              ))}
            </ul>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={() => window.location.reload()} className="button-primary">
              <RotateCw className="h-4 w-4" aria-hidden="true" /> Retry
            </button>
            <Link href="/diagnostics" className="button-secondary">
              <Database className="h-4 w-4" aria-hidden="true" /> View diagnostics
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
