"use client";

import { AlertTriangle } from "lucide-react";
import type { ConversionFilters, ServiceId, WritingContext } from "@/engine/types";

interface FilterBarProps {
  filters: Required<ConversionFilters>;
  onChange: (filters: Required<ConversionFilters>) => void;
}

const services: Array<{ value: "all" | ServiceId; label: string }> = [
  { value: "all", label: "All" },
  { value: "tri-service", label: "Tri-Service" },
  { value: "army", label: "Army" },
  { value: "navy", label: "Navy" },
  { value: "air-force", label: "Air Force" },
  { value: "other", label: "Other" },
];

const contexts: Array<{ value: WritingContext; label: string }> = [
  { value: "internal-service-writing", label: "Internal Service Writing" },
  { value: "signal-message", label: "Signal Message" },
  { value: "civilian-external-correspondence", label: "Civilian/External" },
  { value: "military-qualification", label: "Military Qualification" },
  { value: "national-force-designation", label: "National Force" },
  { value: "operational-writing", label: "Operational Writing" },
  { value: "operational-heading", label: "Operational Order Heading" },
  { value: "formal-letter", label: "Formal Letter" },
  { value: "demi-official-letter", label: "Demi-official Letter" },
  { value: "commanded-letter", label: "Commanded Letter" },
  { value: "service-paper", label: "Service Paper" },
  { value: "air-force-operational-paper", label: "BAF Operational Paper" },
  { value: "allied-forces-correspondence", label: "Allied Forces" },
  { value: "foreign-correspondence", label: "Foreign Organizations" },
  { value: "paramilitary-operational-writing", label: "Para-military" },
  { value: "departmental-title", label: "Departmental/Business Title" },
  { value: "personnel-line", label: "Personnel Name & Quals" },
  { value: "address-box", label: "Address Box" },
];

function chipClass(active: boolean): string {
  return `min-h-11 shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
    active
      ? "border-transparent bg-gold-300 text-forest-950"
      : "border-forest-200 bg-white text-forest-800 hover:bg-forest-50 dark:border-white/15 dark:bg-white/5 dark:text-forest-100 dark:hover:bg-white/10"
  }`;
}

export function FilterBar({ filters, onChange }: FilterBarProps) {
  return (
    <section aria-label="Conversion scope" className="space-y-2">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Service">
        {services.map((service) => (
          <button
            key={service.value}
            type="button"
            aria-pressed={filters.service === service.value}
            className={chipClass(filters.service === service.value)}
            onClick={() => onChange({ ...filters, service: service.value })}
          >
            {service.label}
          </button>
        ))}
      </div>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Writing context">
        {contexts.map((context) => (
          <button
            key={context.value}
            type="button"
            aria-pressed={filters.context === context.value}
            className={`${chipClass(filters.context === context.value)} whitespace-nowrap`}
            onClick={() => onChange({ ...filters, context: context.value })}
          >
            {context.label}
          </button>
        ))}
      </div>
      {["civilian-external-correspondence", "allied-forces-correspondence", "foreign-correspondence"].includes(filters.context) && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>Service abbreviations are excluded for these addressees. Full forms will be retained.</p>
        </div>
      )}
      {filters.context === "operational-heading" && <p className="text-sm text-slate-600 dark:text-stone-300">Operational/administrative headings stay in full.</p>}
      {["formal-letter", "demi-official-letter", "commanded-letter", "service-paper"].includes(filters.context) && <p className="text-sm text-slate-600 dark:text-stone-300">Only decorations, qualifications and arms/services are abbreviated.</p>}
      {filters.context === "personnel-line" && <p className="text-sm text-slate-600 dark:text-stone-300">Rank, name, decorations and qualifications.</p>}
      {filters.context === "air-force-operational-paper" && filters.service !== "air-force" && <p className="text-sm text-slate-600 dark:text-stone-300">Select Air Force to apply this exception.</p>}
    </section>
  );
}
