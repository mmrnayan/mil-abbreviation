"use client";

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import type { HistoryItem } from "@/engine/types";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// docx TextRun does not render newlines, so each line becomes its own paragraph.
function textToParagraphs(text: string): Paragraph[] {
  return text.split(/\n/).map((line) => new Paragraph({ children: [new TextRun(line)] }));
}

export async function downloadTextAsDocx(text: string, filename: string) {
  const doc = new Document({ sections: [{ children: textToParagraphs(text) }] });
  downloadBlob(await Packer.toBlob(doc), filename);
}

export function downloadTextAsTxt(text: string, filename: string) {
  downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), filename);
}

export async function downloadHistoryAsDocx(items: HistoryItem[], filename: string) {
  const children: Paragraph[] = [
    new Paragraph({ text: "Conversion history", heading: HeadingLevel.HEADING_1 }),
    new Paragraph({
      children: [
        new TextRun({
          text: `Exported ${new Date().toLocaleString()} — ${items.length} record${items.length === 1 ? "" : "s"}`,
          italics: true,
        }),
      ],
    }),
    new Paragraph({ text: "" }),
  ];
  for (const item of items) {
    children.push(
      new Paragraph({
        text: `${new Date(item.createdAt).toLocaleString()} (${item.direction.replaceAll("-", " ")})`,
        heading: HeadingLevel.HEADING_2,
      }),
    );
    for (const [label, text] of [
      ["Original", item.originalText],
      ["Converted", item.convertedText],
    ] as const) {
      const lines = text.split(/\n/);
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(lines[0] ?? "")],
        }),
      );
      for (const line of lines.slice(1)) children.push(new Paragraph({ children: [new TextRun(line)] }));
    }
    children.push(new Paragraph({ text: "" }));
  }
  const doc = new Document({ sections: [{ children }] });
  downloadBlob(await Packer.toBlob(doc), filename);
}

export function downloadHistoryAsTxt(items: HistoryItem[], filename: string) {
  const lines: string[] = [
    `Conversion history — exported ${new Date().toLocaleString()} (${items.length} records)`,
    "",
  ];
  for (const item of items) {
    lines.push(`[${new Date(item.createdAt).toLocaleString()}] (${item.direction.replaceAll("-", " ")})`);
    lines.push(`Original:  ${item.originalText}`);
    lines.push(`Converted: ${item.convertedText}`);
    lines.push("");
  }
  downloadBlob(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }), filename);
}
