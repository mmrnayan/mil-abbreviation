/// <reference lib="webworker" />

import { ConverterEngine } from "@/engine/converter";
import { configureRulesOverlay } from "@/engine/rulesOverlay";
import type { AbbreviationRulesOverlay } from "@/engine/rulesOverlay";
import type {
  AbbreviationDataset,
  ConversionDirection,
  ConversionOptions,
} from "@/engine/types";

type IncomingMessage =
  | {
      type: "initialize";
      dataset: AbbreviationDataset;
      /** Paragraph 0241 rules overlay composed on the main thread. */
      overlay?: AbbreviationRulesOverlay;
    }
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
      // The worker has its own copy of the rules-overlay module; without
      // registering the composed overlay here, verb, plural, compound and
      // exception rules would silently be missing from worker conversions.
      if (message.overlay) configureRulesOverlay(message.overlay);
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
