"use client";

import { ArrowDownUp, ArrowLeftRight, LoaderCircle, WandSparkles } from "lucide-react";
import type { ConversionDirection } from "@/engine/types";

interface DirectionSelectorProps {
  direction: ConversionDirection;
  onChange: (direction: ConversionDirection) => void;
  onSwap: () => void;
  onConvert: () => void;
  disabled: boolean;
  converting: boolean;
}

export function DirectionSelector({ direction, onChange, onSwap, onConvert, disabled, converting }: DirectionSelectorProps) {

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 lg:w-[154px]" aria-label="Conversion direction">
      <div className="grid w-full grid-cols-2 rounded-xl border bg-white p-1 shadow-sm lg:grid-cols-1 dark:border-white/10 dark:bg-white/5">
        <button
          type="button"
          onClick={() => onChange("full-to-abbreviation")}
          aria-pressed={direction === "full-to-abbreviation"}
          className={`rounded-lg px-2 py-2.5 text-xs font-bold leading-tight ${direction === "full-to-abbreviation" ? "bg-forest-800 text-white dark:bg-gold-400 dark:text-forest-950" : "text-slate-600 hover:bg-forest-50 dark:text-stone-300 dark:hover:bg-white/10"}`}
        >
          Full Form <span className="hidden lg:inline">→</span><span className="lg:hidden"> to </span> Abbreviation
        </button>
        <button
          type="button"
          onClick={() => onChange("abbreviation-to-full")}
          aria-pressed={direction === "abbreviation-to-full"}
          className={`rounded-lg px-2 py-2.5 text-xs font-bold leading-tight ${direction === "abbreviation-to-full" ? "bg-forest-800 text-white dark:bg-gold-400 dark:text-forest-950" : "text-slate-600 hover:bg-forest-50 dark:text-stone-300 dark:hover:bg-white/10"}`}
        >
          Abbreviation <span className="hidden lg:inline">→</span><span className="lg:hidden"> to </span> Full Form
        </button>
      </div>
      <button type="button" onClick={onSwap} className="button-secondary !rounded-full !p-2.5" title="Swap direction and move the current output to input" aria-label="Swap conversion direction and move output to input">
        <ArrowLeftRight className="hidden h-4 w-4 lg:block" aria-hidden="true" />
        <ArrowDownUp className="h-4 w-4 lg:hidden" aria-hidden="true" />
      </button>
      <button type="button" onClick={onConvert} disabled={disabled || converting} className="button-primary w-full lg:flex-col lg:gap-1 lg:px-3 lg:py-4">
        {converting ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : <WandSparkles className="h-5 w-5" aria-hidden="true" />}
        <span>{converting ? "Converting…" : "Convert"}</span>
      </button>
      <span className="hidden text-center text-[10px] leading-relaxed text-slate-500 lg:block dark:text-stone-500">Longest authorized phrase first</span>
    </div>
  );
}
