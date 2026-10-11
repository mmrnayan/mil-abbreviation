import type { ConversionResult } from "@/engine/types";

export interface TextRange { start: number; end: number }
export interface ReportSelection { source: TextRange; output: TextRange }

/** Partial selections touching a replacement include that entire authorized phrase. */
export function mapSelection(result: ConversionResult, range: TextRange, side: "source" | "output"): ReportSelection {
  const source = side === "source";
  const text = source ? result.originalText : result.convertedText;
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.start < 0 || range.end > text.length || range.end <= range.start) throw new Error("Select a word or phrase first.");
  const records = [...result.replacements].sort((a, b) => a.startIndex - b.startIndex);
  let start = range.start, end = range.end;
  for (const r of records) {
    const a = source ? r.startIndex : r.outputStartIndex;
    const b = source ? r.endIndex : r.outputEndIndex;
    if (a < end && b > start) { start = Math.min(start, a); end = Math.max(end, b); }
  }
  const position = (index: number) => {
    let delta = 0;
    for (const r of records) {
      const a = source ? r.startIndex : r.outputStartIndex;
      const b = source ? r.endIndex : r.outputEndIndex;
      const otherA = source ? r.outputStartIndex : r.startIndex;
      const otherB = source ? r.outputEndIndex : r.endIndex;
      if (index <= a) break;
      if (index < b) return otherA;
      delta = otherB - b;
    }
    return index + delta;
  };
  const primary = { start, end };
  const other = { start: position(start), end: position(end) };
  return source ? { source: primary, output: other } : { source: other, output: primary };
}

export function sentenceRange(text: string, selected: TextRange): TextRange {
  // Segmenter understands common sentence punctuation; preserve all sentences of a multi-sentence selection.
  const segments = [...new Intl.Segmenter("en", { granularity: "sentence" }).segment(text)];
  const first = segments.find((s) => s.index + s.segment.length > selected.start);
  const last = segments.find((s) => s.index + s.segment.length >= selected.end);
  const range = { start: first?.index ?? 0, end: last ? last.index + last.segment.length : text.length };
  while (range.start < selected.start && /\s/u.test(text[range.start])) range.start++;
  while (range.end > selected.end && /\s/u.test(text[range.end - 1])) range.end--;
  if (range.end - range.start > 10000) throw new Error("This sentence is too long to report. Select it in a shorter example.");
  return range;
}

export function selectedOutputRange(element: HTMLElement): TextRange | undefined {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return;
  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.startContainer, range.startOffset);
  return { start: before.toString().length, end: before.toString().length + range.toString().length };
}
