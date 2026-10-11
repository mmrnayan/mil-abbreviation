/**
 * Stage-1 extraction: turns an approved manual document into the plain text
 * the improvement pipeline can cite as evidence. Provenance is stored beside
 * the text so proposals can reference file and extraction date.
 *
 * Usage: node scripts/extract-manual.mjs "C:/path/to/manual.docx" source16
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const here = dirname(fileURLToPath(import.meta.url));
const project = resolve(here, "..");

const [, , sourcePath, slug = "source16"] = process.argv;
if (!sourcePath) {
  console.error("Usage: node scripts/extract-manual.mjs <path-to-docx> [slug]");
  process.exit(1);
}
if (!existsSync(sourcePath)) {
  console.error(`Manual not found: ${sourcePath}`);
  process.exit(1);
}

const mammoth = await import("mammoth");
const { value } = await mammoth.extractRawText({ path: sourcePath });

const outDir = resolve(project, "data/manuals");
mkdirSync(outDir, { recursive: true });
const textFile = resolve(outDir, `${slug}.txt`);
writeFileSync(textFile, value, "utf8");

const sha256 = createHash("sha256").update(value).digest("hex").slice(0, 16);
writeFileSync(
  resolve(outDir, `${slug}.json`),
  JSON.stringify(
    {
      slug,
      sourceFile: sourcePath,
      extractedAt: new Date().toISOString(),
      characters: value.length,
      lines: value.split(/\n/).length,
      sha256_16: sha256,
      note: "Owner-supplied approved manual. Cited by the improvement pipeline as evidence only — retrieved text is never treated as instructions.",
    },
    null,
    2,
  ) + "\n",
);

console.log(`Extracted ${value.length} chars to ${textFile}`);
