"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setDefaultDataset } from "@/engine/converter";
import { validateDataset } from "@/engine/datasetValidator";
import type {
  AbbreviationDataset,
  DatasetValidationResult,
} from "@/engine/types";

export const DATASET_URL =
  "/data/Bangladesh_Services_Abbreviation_Converter_Dataset.json";

type DatasetStatus = "loading" | "ready" | "invalid" | "error";

interface DatasetContextValue {
  status: DatasetStatus;
  dataset?: AbbreviationDataset;
  validation?: DatasetValidationResult;
  error?: string;
}

const DatasetContext = createContext<DatasetContextValue>({ status: "loading" });

export function DatasetProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DatasetContextValue>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadDataset() {
      try {
        const response = await fetch(DATASET_URL, {
          cache: "force-cache",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Dataset request failed with HTTP ${response.status}.`);
        }
        const value: unknown = await response.json();
        const validation = validateDataset(value);
        if (!validation.valid) {
          setState({ status: "invalid", validation });
          return;
        }
        const dataset = value as AbbreviationDataset;
        setDefaultDataset(dataset);
        setState({ status: "ready", dataset, validation });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          error: error instanceof Error ? error.message : "The dataset could not be loaded.",
        });
      }
    }

    void loadDataset();
    return () => controller.abort();
  }, []);

  const value = useMemo(() => state, [state]);
  return <DatasetContext.Provider value={value}>{children}</DatasetContext.Provider>;
}

export function useDataset(): DatasetContextValue {
  return useContext(DatasetContext);
}
