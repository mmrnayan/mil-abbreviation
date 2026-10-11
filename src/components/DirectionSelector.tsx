"use client";

import { ArrowDownUp, ArrowLeftRight } from "lucide-react";

interface DirectionSelectorProps {
  onSwap: () => void;
}

/**
 * Conversion runs automatically as the user types, so the only control needed
 * between the input and output panels is the swap button.
 */
export function DirectionSelector({ onSwap }: DirectionSelectorProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 lg:w-[154px]" aria-label="Conversion direction">
      <button type="button" onClick={onSwap} className="button-secondary !rounded-full !p-5 shadow-md transition-transform hover:scale-105" title="Swap direction and move the current output to input" aria-label="Swap conversion direction and move output to input">
        <ArrowLeftRight className="hidden h-7 w-7 lg:block" aria-hidden="true" />
        <ArrowDownUp className="h-7 w-7 lg:hidden" aria-hidden="true" />
      </button>
    </div>
  );
}
