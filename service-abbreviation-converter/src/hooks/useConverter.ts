"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ConverterEngine } from "@/engine/converter";
import type {
  AbbreviationDataset,
  ConversionDirection,
  ConversionOptions,
  ConversionResult,
} from "@/engine/types";

interface PendingRequest {
  resolve: (result: ConversionResult) => void;
  reject: (error: Error) => void;
}

type WorkerResponse =
  | { type: "ready" }
  | { type: "initialization-error"; error: string }
  | { type: "result"; requestId: number; result: ConversionResult }
  | { type: "conversion-error"; requestId: number; error: string };

export function useConverter(dataset?: AbbreviationDataset) {
  const workerRef = useRef<Worker | undefined>(undefined);
  const fallbackRef = useRef<ConverterEngine | undefined>(undefined);
  const readyRef = useRef(false);
  const pendingRef = useRef(new Map<number, PendingRequest>());
  const requestIdRef = useRef(0);
  const activeCountRef = useRef(0);
  const [isReady, setIsReady] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [workerMode, setWorkerMode] = useState<"worker" | "fallback">("worker");

  useEffect(() => {
    if (!dataset) return;
    const pendingRequests = pendingRef.current;
    fallbackRef.current = undefined;
    readyRef.current = false;
    setIsReady(false);

    const activateFallback = () => {
      fallbackRef.current = new ConverterEngine(dataset);
      readyRef.current = true;
      setWorkerMode("fallback");
      setIsReady(true);
    };

    if (typeof Worker === "undefined") {
      activateFallback();
      return;
    }

    let worker: Worker;
    try {
      worker = new Worker(new URL("../workers/converter.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      activateFallback();
      return;
    }
    workerRef.current = worker;
    setWorkerMode("worker");

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;
      if (message.type === "ready") {
        readyRef.current = true;
        setIsReady(true);
        return;
      }
      if (message.type === "initialization-error") {
        worker.terminate();
        workerRef.current = undefined;
        activateFallback();
        return;
      }
      const pending = pendingRef.current.get(message.requestId);
      if (!pending) return;
      pendingRef.current.delete(message.requestId);
      activeCountRef.current = Math.max(0, activeCountRef.current - 1);
      setIsConverting(activeCountRef.current > 0);
      if (message.type === "result") pending.resolve(message.result);
      else pending.reject(new Error(message.error));
    };

    worker.onerror = () => {
      worker.terminate();
      workerRef.current = undefined;
      for (const pending of pendingRef.current.values()) {
        pending.reject(new Error("The conversion worker stopped unexpectedly."));
      }
      pendingRef.current.clear();
      activeCountRef.current = 0;
      setIsConverting(false);
      activateFallback();
    };

    worker.postMessage({ type: "initialize", dataset });
    return () => {
      worker.terminate();
      workerRef.current = undefined;
      readyRef.current = false;
      for (const pending of pendingRequests.values()) {
        pending.reject(new Error("Conversion was cancelled."));
      }
      pendingRequests.clear();
    };
  }, [dataset]);

  const convert = useCallback(
    async (
      text: string,
      direction: ConversionDirection,
      options: ConversionOptions,
    ): Promise<ConversionResult> => {
      if (!dataset || !readyRef.current) {
        throw new Error("The conversion engine is still preparing the dataset.");
      }
      if (fallbackRef.current) {
        setIsConverting(true);
        try {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          return fallbackRef.current.convert(text, direction, options);
        } finally {
          setIsConverting(false);
        }
      }

      const worker = workerRef.current;
      if (!worker) throw new Error("The conversion worker is unavailable.");
      const requestId = ++requestIdRef.current;
      activeCountRef.current += 1;
      setIsConverting(true);
      return new Promise<ConversionResult>((resolve, reject) => {
        pendingRef.current.set(requestId, { resolve, reject });
        worker.postMessage({
          type: "convert",
          requestId,
          text,
          direction,
          options,
        });
      });
    },
    [dataset],
  );

  return { convert, isReady, isConverting, workerMode };
}
