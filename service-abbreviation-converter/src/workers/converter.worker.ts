/// <reference lib="webworker" />

import { ConverterEngine } from "@/engine/converter";
import type {
  AbbreviationDataset,
  ConversionDirection,
  ConversionOptions,
} from "@/engine/types";

type IncomingMessage =
  | { type: "initialize"; dataset: AbbreviationDataset }
  | {
      type: "convert";
      requestId: number;
      text: string;
      direction: ConversionDirection;
      options: ConversionOptions;
    };

let engine: ConverterEngine | undefined;

self.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const message = event.data;
  if (message.type === "initialize") {
    try {
      engine = new ConverterEngine(message.dataset);
      self.postMessage({ type: "ready" });
    } catch (error) {
      self.postMessage({
        type: "initialization-error",
        error: error instanceof Error ? error.message : "Worker initialization failed.",
      });
    }
    return;
  }

  try {
    if (!engine) throw new Error("Conversion worker is not initialized.");
    const result = engine.convert(
      message.text,
      message.direction,
      message.options,
    );
    self.postMessage({ type: "result", requestId: message.requestId, result });
  } catch (error) {
    self.postMessage({
      type: "conversion-error",
      requestId: message.requestId,
      error: error instanceof Error ? error.message : "Conversion failed.",
    });
  }
};

export {};
