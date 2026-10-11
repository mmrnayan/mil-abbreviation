"use client";

import { AlertTriangle, SlidersHorizontal } from "lucide-react";
import type { AnnexDefinition, ConversionFilters, ServiceId, WritingContext } from "@/engine/types";

interface FilterBarProps {
  filters: Required<ConversionFilters>;
  annexes: AnnexDefinition[];
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

export function FilterBar({ filters, annexes, onChange }: FilterBarProps) {
  return (
    <section className="surface-card p-4 sm:p-5" aria-labelledby="filter-heading">
      <div className="mb-4 flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-forest-700 dark:text-gold-300" aria-hidden="true" />
        <h2 id="filter-heading" className="text-sm font-bold">Conversion scope</h2>
        <span className="text-xs text-slate-500 dark:text-stone-400">Optional filters</span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label>
          <span className="form-label">Service</span>
          <select
            className="form-control"
            value={filters.service}
            onChange={(event) => onChange({ ...filters, service: event.target.value as Required<ConversionFilters>["service"] })}
          >
            {services.map((service) => <option value={service.value} key={service.value}>{service.label}</option>)}
          </select>
        </label>
        <label>
          <span className="form-label">Annex</span>
          <select
            className="form-control"
            value={filters.annex}
            onChange={(event) => onChange({ ...filters, annex: event.target.value })}
          >
            <option value="all">All Annexes</option>
            {annexes.map((annex) => (
              <option value={annex.id} key={annex.id}>Annex {annex.id} — {annex.title}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="form-label">Writing context</span>
          <select
            className="form-control"
            value={filters.context}
            onChange={(event) => onChange({ ...filters, context: event.target.value as WritingContext })}
          >
            {contexts.map((context) => <option value={context.value} key={context.value}>{context.label}</option>)}
          </select>
        </label>
      </div>
      {["civilian-external-correspondence", "allied-forces-correspondence", "foreign-correspondence"].includes(filters.context) && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100" role="status">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>Service abbreviations are excluded for these addressees. Full forms will be retained.</p>
        </div>
      )}
      {filters.context === "operational-heading" && <p className="mt-3 text-sm text-slate-600 dark:text-stone-300">Paste the paragraph heading here. It will remain in full as required for operational and administrative orders.</p>}
      {["formal-letter", "demi-official-letter", "commanded-letter", "service-paper"].includes(filters.context) && <p className="mt-3 text-sm text-slate-600 dark:text-stone-300">Only decorations, qualifications and arms or services will be abbreviated.</p>}
      {filters.context === "personnel-line" && <p className="mt-3 text-sm text-slate-600 dark:text-stone-300">Use for a person’s rank, name, decorations and qualifications. Initials and qualification punctuation will follow the source format.</p>}
      {filters.context === "air-force-operational-paper" && filters.service !== "air-force" && <p className="mt-3 text-sm text-slate-600 dark:text-stone-300">Select Air Force to apply the exception for BAF service papers on operational matters.</p>}
    </section>
  );
}
