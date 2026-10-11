# Worklog

Dated log of decisions and data changes for the Service Abbreviation Converter. Newest entries first.

## 2026-10-10

- Implemented the approved navigation, selected-text reporting, durable delivery, diagnosis and offline packaging plan in v1.3.0. Existing history and owner evidence files are preserved.
- Consumer builds contain only three routes; public collection exposes report submission and approved downloads without report listing or owner modification APIs.
- Approved data loads from the bundle without network, with validated complete updates and rollback; dynamic learned pairs no longer alter consumer outputs.
- Verified 276 tests, TypeScript, ESLint, consumer/owner production builds and Windows offline startup with all HTTP/HTTPS blocked. Built the Windows installer and Android debug APK; generated and synced the iOS project including native exports/privacy manifest. Physical phone testing, HTTPS service-origin configuration and Apple signing/distribution are not claimed complete.

## 2026-10-09

- **Source audit and converter repair (1.2.0, unreleased)**: repaired data against the DOCX, retained stable IDs and source locations, explicitly expanded source notation and split paired outputs in both directions. Paragraph 0241 morphology now honors entry permissions, service specificity and verification status. Document contexts enforce restrictions. Conversion feedback is available beside the output with context already filled in. The source audit and expanded regression suite verify the reviewed behavior; no release tag or deployment was created.
- **Validation**: all 262 tests, ESLint and the production build passed. The source check covers 2,122 unambiguous table pairs; all 2,686 base entries have source locations, including paragraph pairs and automatically numbered units. Rerunning the migration makes no further changes. Browser checks confirmed the deployment family and prefilled correction form.
- **Settings page**: "Help improve the app" moved here from the converter page. Toggle is on by default (opt-out stored in `sac:learning-share:v1`). Below it, a per-conversion review list: each saved conversion can be marked "Converted correctly" / "Not converted correctly" (stored locally in `sac:conversion-checks:v1`); incorrect verdicts also POST to `/api/feedback` (category `incorrect-conversion`) with input/actual/expected so the review pipeline can propose fixes.
- **Versioning introduced**: `package.json` version is the single source, re-exported via `src/version.ts`, displayed in the footer and on Settings. Git tags `vX.Y.Z` mark every release and are the rollback points. `CHANGELOG.md` started.
- **Gold regression suite (dataset layer D)**: `data/gold-test-cases.jsonl` + `src/tests/gold.test.ts` — every case runs through the engine on `npm test`; approved corrections must append a case (`scripts/add-gold-case.mjs`) so fixed bugs cannot silently return.
- **`npm run check`** added: lint + test + build, the pre-release gate.
- Docs created: `ARCHITECTURE.md`, `WORKLOG.md` (this file), `CHANGELOG.md`; README updated with release process.
- Tagged `v1.0.0` (state before this work) and released `v1.1.0` (all of the above).

## Earlier history (summary, backfilled 2026-10-09)

- **2026-10-02** — Usage learning: corrections teach the dictionary (HADR/Minimum/terrain fixes). Review-loophole fixes and plainer review wording. Data: correction FB-0004 + pending proposal AP-0001 (abbr-0513 Employ vs "Electro Magnetic Pulse"). Background improvement pipeline live: collect evidence → propose (AP-nnnn) → owner reviews at `/review`.
- **2026-09-30** — UI, exports and feedback systems in place.
- **Earlier** — 0241 morphology engine; dataset split into layers A/B/C in `public/data/` (monolith deleted); Review Mode `/review` with 11-type error taxonomy; known data bugs fixed (e.g. abbr-1980 Command→COMSWADS).
