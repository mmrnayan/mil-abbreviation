"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import bundled from "../../public/data/dataset-package.json";
import { setDefaultDataset } from "@/engine/converter";
import { configureRulesOverlay, type AbbreviationRulesOverlay } from "@/engine/rulesOverlay";
import type { AbbreviationDataset, DatasetValidationResult } from "@/engine/types";
import { composePackage, validatePackage, type DatasetPackage } from "@/utils/datasetPackage";
import { initializeLocalStore, readLocal, writeLocal, withLocalLock } from "@/utils/localStore";
import { serviceUrl } from "@/utils/onlineService";
import { installDataset } from "@/utils/datasetUpdates";

export const DATASET_LAYER_URLS = { base: "/data/abbreviations.base.json", rules: "/data/abbreviation-rules.json", overrides: "/data/abbreviation-overrides.json" } as const;
interface Snapshot { current: DatasetPackage; previous?: DatasetPackage }
interface DatasetContextValue {
  status: "loading" | "ready" | "invalid" | "error";
  dataset?: AbbreviationDataset; overlay?: AbbreviationRulesOverlay; validation?: DatasetValidationResult;
  error?: string; version?: string; updateMessage?: string; updating?: boolean;
  checkUpdates: () => Promise<void>; restorePrevious: () => Promise<void>;
}
const DatasetContext = createContext<DatasetContextValue>({ status: "loading", checkUpdates: async () => {}, restorePrevious: async () => {} });
const KEY = "dataset-snapshot-v1";

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<DatasetContextValue, "checkUpdates" | "restorePrevious">>({ status: "loading" });
  function activate(pkg: DatasetPackage) {
    const composed = composePackage(pkg);
    configureRulesOverlay(composed.overlay);
    setDefaultDataset(composed.dataset);
    setState({ status: "ready", ...composed, version: pkg.version });
  }
  useEffect(() => {
    let disposed = false;
    activate(bundled as unknown as DatasetPackage);
    if (process.env.NEXT_PUBLIC_OWNER_WORKSPACE === "1") return () => { disposed = true; };
    void (async () => {
      try {
        await initializeLocalStore();
        const snapshot = await readLocal<Snapshot>(KEY);
        if (snapshot) {
          try { const current = await validatePackage(snapshot.current); if (!disposed) activate(current); }
          catch {
            const previous = snapshot.previous ? await validatePackage(snapshot.previous).catch(() => undefined) : undefined;
            if (!disposed && previous) activate(previous);
            if (!disposed) setState((s) => ({ ...s, updateMessage: "Stored update was invalid. Using a validated working dataset." }));
          }
        }
      } catch (cause) {
        if (!disposed) setState((s) => ({ ...s, updateMessage: cause instanceof Error ? cause.message : "Using bundled data; local update storage is unavailable." }));
      }
    })();
    return () => { disposed = true; };
  }, []);

  async function checkUpdates() {
    setState((s) => ({ ...s, updating: true, updateMessage: "Checking for approved updates…" }));
    try {
      await withLocalLock("dataset-update", async () => {
        const response = await fetch(serviceUrl("/data/dataset-package.json"), { cache: "no-store", signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`Update download failed (HTTP ${response.status}).`);
        const installed = await installDataset(await response.json(), bundled as unknown as DatasetPackage);
        if (!installed.changed) { setState((s) => ({ ...s, updating: false, updateMessage: "Your approved dataset is up to date." })); return; }
        activate(installed.current);
        setState((s) => ({ ...s, updateMessage: "Approved dataset updated. The previous version is available to restore." }));
      });
    } catch (cause) {
      setState((s) => ({ ...s, updating: false, updateMessage: `${cause instanceof Error ? cause.message : "Update failed."} Your working dataset is retained.` }));
    }
  }
  async function restorePrevious() {
    try {
      await withLocalLock("dataset-update", async () => {
        const snapshot = await readLocal<Snapshot>(KEY);
        if (!snapshot?.previous) throw new Error("No previous downloaded version is stored.");
        const previous = await validatePackage(snapshot.previous);
        await writeLocal(KEY, { current: previous, previous: snapshot.current });
        activate(previous);
        setState((s) => ({ ...s, updateMessage: "Previous approved dataset restored." }));
      });
    } catch (cause) { setState((s) => ({ ...s, updateMessage: cause instanceof Error ? cause.message : "Restore failed." })); }
  }
  return <DatasetContext.Provider value={{ ...state, checkUpdates, restorePrevious }}>{children}</DatasetContext.Provider>;
}
export function useDataset(): DatasetContextValue { return useContext(DatasetContext); }
