# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/); versioning is [SemVer](https://semver.org/) and each release is tagged in git (`vX.Y.Z`).

## [1.3.0] — 2026-10-10

- Simplified navigation to Converter and Dictionary, embedded recent history and moved Settings behind a gear.
- Replaced correctness cards and automatic meaning sharing with deliberate sentence-scoped reports, optional suggestions/contacts and selected-word mapping.
- Added durable offline delivery, visible statuses, stable-ID acknowledgements, retry/cancel/export/import and native resume/share support.
- Added local and owner-side accuracy comparisons, grouped sentence evidence and legacy report import.
- Introduced validated atomic approved-data packages and previous-version restore.
- Separated the static consumer export and public collector from loopback-only owner tools.
- Bundled offline Windows, Android and iPhone projects; Windows installer and Android test APK built. Apple compilation/signing and online installer origin remain distribution setup.

## [1.2.0] — 2026-10-09

- Repaired dictionary extraction, missing source rows, vessel outputs, service classifications and optional/slash notation against the DOCX; added source locations and a repeatable pair audit.
- Enforced entry-specific grammar permissions, service-aware morphology, deployment-family behavior and safe compound/reverse expansion.
- Added document and recipient restrictions, full operational headings, personnel-line punctuation and address-box rank handling.
- Distinguished source-authorized, generated and reviewer-approved conversions and retained source confidence.
- Added direct conversion feedback with prefilled input/output and a reviewer handoff.
- Updated dataset caching so installed clients receive repaired data on their next online load.

## [1.1.0] — 2026-10-09

### Added
- **Settings page** (`/about`): "Help improve the app" section with per-conversion correctness review — mark each saved conversion correct/incorrect, optionally record the expected output. Incorrect verdicts are sent automatically to the feedback pipeline; correct marks stay local.
- **Gold regression suite** (`data/gold-test-cases.jsonl` + `src/tests/gold.test.ts`): every case is run through the engine on `npm test`; any mismatch fails the run. Approved corrections must append a gold case.
- **Version display**: app version (from `package.json`) shown in the footer and on Settings, next to the dataset version.
- **`npm run check`**: lint + test + build in one command; the pre-release gate.
- Documentation: `ARCHITECTURE.md`, `WORKLOG.md`, this changelog, and a release/rollback section in the README.

### Changed
- "Help improve the app" toggle moved from the converter page to Settings; it is now **on by default** (explicit opt-out is remembered).
- Nav tab "About" renamed to **Settings**.

### Fixed
- (none in this release — accuracy work is ongoing via the gold suite and feedback pipeline)

## [1.0.0] — 2026-10-09

Initial tagged release. Full-sentence abbreviation conversion (both directions) on the JSSDM 2022 three-layer dataset (base 2,633 entries / rules / overrides), morphology engine, ambiguity review, dictionary, history, review mode with improvement pipeline, PWA. Corresponds to commit `b91fcc4a`.
