Content-focused redesign — strip briefing/marketing text so the converter and dictionary data are the visual focus.

## Main converter page (`src/components/ConverterPanel.tsx`)
- **Delete the hero band entirely** (h1 "Write clearly. Abbreviate with confidence.", the JSSDM 2022 attribution paragraph, and the three stats chips "N entries / Local only / Worker accelerated"). The converter workspace becomes the first thing on screen.
- Keep an `sr-only` h1 ("Abbreviation Converter") for accessibility/SEO — invisible, screen-reader only.
- **Delete the privacy aside** ("Conversion runs locally… Text is sent to the app owner only…" and "Converts and saves to history automatically · Ctrl/⌘ + Enter saves instantly"). Keep a subtle `kbd`-style "Ctrl/⌘ ↵" hint at the bottom of the input textarea so the shortcut stays discoverable without the sentence.
- Keep functional micro-copy: "Select text to report it" on output header, warning/unresolved sections, details table.
- Condense FilterBar's three multi-sentence hints (`src/components/FilterBar.tsx`) to one short line each (e.g. "Paragraph heading", "Signature block", "Personnel line").
- History block: drop the "Browser-local record" eyebrow and its explanatory sentence; keep just "Recent conversions" + the record count.

## Dictionary page (`src/components/DictionaryTable.tsx`)
- Replace the hero (eyebrow "Authoritative reference", h1 + description paragraph, stats chips) with a compact single-row header: small "Dictionary" heading + "{n} records · {n} verify" on one line, with search input and filters immediately below — the table becomes the focus.
- Keep the results count, sort note, and empty state as-is (functional).

## Footer (`src/components/AppFooter.tsx`)
- Reduce to one minimal row: version (`v1.3.0`) + Settings link. Remove the "Conversion runs locally…" sentence and the JSSDM attribution line.

## Settings page (`src/components/AboutContent.tsx`)
- Trim each section's explanation to one short sentence; delete the closing "Based on JSSDM 2022… No app login is required." paragraph. Keep controls and statuses.

## Header (`src/components/AppHeader.tsx`)
- Remove the "Dataset verified" pill (xl-only); header stays logo + title + nav.

## Not touched
- Owner-only screens (diagnostics, rules, review) — not part of the consumer experience; sr-only accessibility strings; all conversion logic.

## Verification
- `npm run lint`, `npm test` (276 tests), local consumer build with BASE_PATH, then commit and push (Vercel + GitHub Pages redeploy automatically).