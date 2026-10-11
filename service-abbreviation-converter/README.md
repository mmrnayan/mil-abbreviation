# Service Abbreviation Converter

**Bangladesh Services Writing Assistant** is a production-ready, responsive Next.js application that converts complete service-writing sentences between full forms and authorized abbreviations.

The bundled `Bangladesh_Services_Abbreviation_Converter_Dataset.json` (schema `1.1.0`) is the application's single source of truth. Dictionary entries are not duplicated or manually hard-coded in the application.

## Highlights

- Full-sentence, cursor-based conversion that continues after every replacement
- Forward matching from every declared `entry.match_variants` value
- Longest complete phrase wins at each cursor position
- No repeated global replacement chain and no replacement cascading
- Original punctuation and untouched formatting are preserved
- URLs, email addresses, file paths, decimals, date/time groups and existing authorized abbreviations are protected
- Forward and reverse conversion with service, annex and writing-context filters
- Dataset conflict handling and accessible user review for ambiguous reverse expansions
- “Apply to all” and browser-local remembered ambiguity choices
- Dataset-driven contextual rules for appointments, national force designations, qualifications and signal-message exclusions
- Safe component-based change highlighting (no `dangerouslySetInnerHTML`)
- Searchable, filterable, paginated 2,633-entry dictionary
- Rules page rendered directly from `converter_config`
- Latest 50 conversions stored in local storage
- Startup dataset validation and diagnostics page
- Web Worker conversion and a synchronous fallback for browser compatibility
- Installable PWA with an offline application shell and cached dataset
- WCAG-oriented keyboard controls, focus states, screen-reader announcements and modal focus management
- 38 automated engine and validation tests

## Privacy

> Your text is processed locally and is not uploaded.

The browser dynamically loads the bundled dataset, builds the matching indexes locally, and sends conversion work only to a same-page Web Worker. The first version uses no database and no external API. Preferences, remembered ambiguity decisions and history remain in browser local storage.

## Requirements

- Node.js **20.9 or newer**
- npm 10 or newer recommended

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Quality checks

```bash
npm run lint
npm test
npm run build
```

The production server can then be run with:

```bash
npm start
```

## Available scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Create an optimized production build and run TypeScript checks |
| `npm start` | Serve the production build |
| `npm run lint` | Run ESLint with Next.js Core Web Vitals and TypeScript rules |
| `npm test` | Run the Vitest suite once |
| `npm run test:watch` | Run Vitest in watch mode |

## Dataset

The authoritative file is:

```text
public/data/Bangladesh_Services_Abbreviation_Converter_Dataset.json
```

It is fetched dynamically by `DatasetProvider` and also cached by the production service worker. Tests import this same file; no second dictionary copy is maintained.

At startup, the validator checks:

- schema version `1.1.0`
- required root and entry properties
- unique entry IDs
- declared annexes and supported services
- non-empty full forms, abbreviations and match variants
- replacement IDs referencing existing entries
- conflict IDs referencing existing entries
- duplicate variants within an entry

Blocking diagnostics disable conversion and are shown on the Diagnostics page. Medium-confidence records remain valid, display a verification indicator and add a warning whenever used.

### Updating the dataset

1. Replace the JSON file at the path above.
2. Keep the same filename, or update `DATASET_URL` in `src/providers/DatasetProvider.tsx` and the service-worker cache entry.
3. Run `npm test` and `npm run build`.
4. Open `/diagnostics` and confirm that validation passes.
5. Increment `CACHE_NAME` in `public/sw.js` so installed clients receive the new dataset promptly.

## Conversion architecture

### Forward direction

`ConverterEngine` builds a character trie once from enabled entries and each value in `match_variants`. Matching normalizes Unicode apostrophes and whitespace runs only for comparison; it does not rewrite untouched source text.

The scan is conceptually:

```text
while cursor is before end of input
  copy a protected span when one begins here
  find trie candidates beginning at cursor
  remove candidates rejected by filters or boundaries
  compare authorized contextual candidates
  select the longest complete candidate
  emit one replacement and its source/output offsets
  advance beyond the match
  otherwise copy the current source character
```

Tie-breaking prefers an exact `full_form` match over a variant. This is important for records such as `Major`, where a rank entry and a general source-notation variant both exist. Service specificity, dataset priority and `replacement_entry_ids` order provide deterministic fallback ordering.

Generated output is never scanned again, so a replacement cannot trigger an unintended secondary replacement.

### Reverse direction

The reverse trie indexes complete printed abbreviations. Reverse matching is case-exact, boundary-aware and longest-first so ordinary lower-case prose is not mistaken for upper-case national or military abbreviations.

After service and annex filters:

- one distinct full form is expanded automatically;
- multiple meanings remain unchanged and return an ambiguity record;
- Annex B choices come from `meanings`, not the combined printed `full_form`;
- a selected meaning is recorded as `user-selected`;
- abbreviation-like unknown terms are returned as unresolved records.

### Context rules

The matcher reads which rules exist from `converter_config.context_rules`. It supports assistant, acting, deputy, deputy assistant, officiating and vice appointments; national distinguishing-letter placement; military-qualification casing; and signal-message-only exclusions. Ordinary dictionary candidates are evaluated first. A contextual template supersedes one only when it consumes a longer authorized source phrase.

## Application routes

| Route | Description |
|---|---|
| `/` | Two-panel converter workspace |
| `/dictionary` | Search and filter all dataset entries |
| `/rules` | Dataset-rendered conversion policies |
| `/history` | Reopen, copy, delete and export local history |
| `/about` | Method, privacy and PWA information |
| `/diagnostics` | Startup validation status and annex coverage |

## Project structure

```text
src/
  app/                    Next.js routes and global styles
  components/             Converter, dictionary, rules, history and shared UI
  engine/                 Trie, protection, conversion, context and validation
  hooks/                  Web Worker conversion, history and preferences
  providers/              Dynamic dataset loader
  workers/                Browser conversion worker
  tests/                  Vitest engine and validator suites
public/
  data/                    Authoritative JSON dataset
  icons/                   PWA icons
  manifest.webmanifest    PWA manifest
  sw.js                   Offline service worker
```

## Deployment

### Node hosting

```bash
npm ci
npm run build
npm start
```

The server must expose the application at the same origin as the bundled `/data` and `/sw.js` files.

### Vercel or compatible Next.js platform

Import the repository and use the standard Next.js defaults:

- install command: `npm ci`
- build command: `npm run build`
- output: Next.js default

### PWA notes

Service workers require HTTPS outside `localhost`. The worker is registered only in production. A user should complete one online production visit before relying on offline mode; that visit caches the generated application resources and dataset.

## Operational note

This application assists writing; it does not replace source-manual review. Pay particular attention to:

- medium-confidence reconstructed records;
- reverse abbreviations with multiple meanings;
- external or civilian correspondence, where the source discourages Service abbreviations;
- any operational context requiring a later or separately controlled edition of the source material.
