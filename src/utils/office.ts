type OfficeResult = { status: string; value?: string; error?: { message: string } };

declare global {
  interface Window {
    Office?: { context: { document: { getSelectedDataAsync: (type: string, options: { valueFormat: string }, callback: (result: OfficeResult) => void) => void; setSelectedDataAsync: (value: string, callback: (result: OfficeResult) => void) => void } }; onReady?: (callback: () => void) => void };
  }
}

export function isOfficeHost() {
  return typeof window !== "undefined" && Boolean(window.Office?.context?.document);
}

export function readWordSelection() {
  return new Promise<string>((resolve, reject) => {
    if (!isOfficeHost()) return reject(new Error("Open this page inside Microsoft Word to read a selection."));
    window.Office!.context.document.getSelectedDataAsync("text", { valueFormat: "unformatted" }, (result) => {
      result.status === "succeeded" ? resolve(result.value ?? "") : reject(new Error(result.error?.message ?? "Word selection could not be read."));
    });
  });
}

export function replaceWordSelection(text: string) {
  return new Promise<void>((resolve, reject) => {
    if (!isOfficeHost()) return reject(new Error("Open this page inside Microsoft Word to insert a result."));
    window.Office!.context.document.setSelectedDataAsync(text, (result) => {
      result.status === "succeeded" ? resolve() : reject(new Error(result.error?.message ?? "Word selection could not be replaced."));
    });
  });
}
