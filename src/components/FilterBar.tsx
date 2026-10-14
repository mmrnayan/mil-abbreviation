"use client";

import { AlertTriangle } from "lucide-react";
import type { ConversionFilters, ServiceId, WritingContext } from "@/engine/types";

interface FilterBarProps {
  filters: Required<ConversionFilters>;
  onChange: (filters: Required<ConversionFilters>) => void;
}

const services: Array<{ value: "all" | ServiceId; label: string }> = [
  { value: "all", label: "All Services" },
  { value: "tri-service", label: "Tri-Service" },
  { value: "army", label: "Army" },
  { value: "navy", label: "Navy" },
  { value: "air-force", label: "Air Force" },
  { value: "other", label: "Other" },
];

const contexts: Array<{ value: WritingContext; label: string }> = [
  { value: "internal-service-writing", label: "Internal Service Writing" },
  { value: "signal-message", label: "Signal Message" },
  { value: "civilian-external-correspondence", label: "Civilian/External Correspondence" },
  { value: "military-qualification", label: "Military Qualification" },
  { value: "national-force-designation", label: "National Force Designation" },
  { value: "operational-writing", label: "Operational Writing" },
  { value: "operational-heading", label: "Operational Order Paragraph Heading" },
  { value: "formal-letter", label: "Formal Letter" },
  { value: "demi-official-letter", label: "Demi-official Letter" },
  { value: "commanded-letter", label: "Commanded Letter" },
  { value: "service-paper", label: "Service Paper" },
  { value: "air-force-operational-paper", label: "BAF Service Paper on Operational Matters" },
  { value: "allied-forces-correspondence", label: "Correspondence with Allied Forces" },
  { value: "foreign-correspondence", label: "Correspondence with Foreign Organizations" },
  { value: "paramilitary-operational-writing", label: "Operational Writing to Para-military Forces" },
  { value: "departmental-title", label: "Departmental or Business Title" },
  { value: "personnel-line", label: "Personnel Name and Qualifications" },
  { value: "address-box", label: "Correspondence Address Box" },
];

export function FilterBar({ filters, onChange }: FilterBarProps) {
  return (
    <section aria-label="Conversion scope" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label>
        <span className="sr-only">Service</span>
        <select
          className="form-control"
          value={filters.service}
          onChange={(event) => onChange({ ...filters, service: event.target.value as Required<ConversionFilters>["service"] })}
        >
          {services.map((service) => <option value={service.value} key={service.value}>{service.label}</option>)}
        </select>
      </label>
      <label>
        <span className="sr-only">Writing context</span>
        <select
          className="form-control"
          value={filters.context}
          onChange={(event) => onChange({ ...filters, context: event.target.value as WritingContext })}
        >
          {contexts.map((context) => <option value={context.value} key={context.value}>{context.label}</option>)}
        </select>
      </label>
      {["civilian-external-correspondence", "allied-forces-correspondence", "foreign-correspondence"].includes(filters.context) && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 sm:col-span-2 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>Service abbreviations are excluded for these addressees. Full forms will be retained.</p>
        </div>
      )}
      {filters.context === "operational-heading" && <p className="text-sm text-slate-600 sm:col-span-2 dark:text-stone-300">Operational/administrative headings stay in full.</p>}
      {["formal-letter", "demi-official-letter", "commanded-letter", "service-paper"].includes(filters.context) && <p className="text-sm text-slate-600 sm:col-span-2 dark:text-stone-300">Only decorations, qualifications and arms/services are abbreviated.</p>}
      {filters.context === "personnel-line" && <p className="text-sm text-slate-600 sm:col-span-2 dark:text-stone-300">Rank, name, decorations and qualifications.</p>}
      {filters.context === "air-force-operational-paper" && filters.service !== "air-force" && <p className="text-sm text-slate-600 sm:col-span-2 dark:text-stone-300">Select Air Force to apply this exception.</p>}
    </section>
  );
}
