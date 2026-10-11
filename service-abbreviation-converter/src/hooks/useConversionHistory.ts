"use client";

import { useCallback, useEffect, useState } from "react";
import type { ConversionResult, HistoryItem } from "@/engine/types";

export const HISTORY_STORAGE_KEY = "sac:conversion-history:v1";
export const REOPEN_STORAGE_KEY = "sac:reopen-conversion:v1";
const HISTORY_LIMIT = 50;

function readHistory(): HistoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(HISTORY_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed) ? (parsed as HistoryItem[]).slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function saveHistory(items: HistoryItem[]): void {
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event("sac-history-change"));
}

export function useConversionHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const update = () => setItems(readHistory());
    update();
    window.addEventListener("storage", update);
    window.addEventListener("sac-history-change", update);
    return () => {
      window.removeEventListener("storage", update);
      window.removeEventListener("sac-history-change", update);
    };
  }, []);

  const addResult = useCallback((result: ConversionResult) => {
    const item: HistoryItem = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      createdAt: new Date().toISOString(),
      direction: result.direction,
      originalText: result.originalText,
      convertedText: result.convertedText,
      appliedFilters: result.appliedFilters,
      replacementCount: result.replacements.length,
      ambiguityCount: result.ambiguities.length,
      unresolvedCount: result.unresolved.length,
    };
    setItems((current) => {
      const next = [item, ...current].slice(0, HISTORY_LIMIT);
      saveHistory(next);
      return next;
    });
    return item;
  }, []);

  const remove = useCallback((id: string) => {
    setItems((current) => {
      const next = current.filter((item) => item.id !== id);
      saveHistory(next);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    saveHistory([]);
    setItems([]);
  }, []);

  const stageForReopen = useCallback((item: HistoryItem) => {
    window.localStorage.setItem(REOPEN_STORAGE_KEY, JSON.stringify(item));
  }, []);

  return { items, addResult, remove, clear, stageForReopen };
}
