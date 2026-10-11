# Graph Report - E:\JSSDM_App\abbre\abb\service-abbreviation-converter  (2026-10-02)

## Corpus Check
- 114 files · ~82,253 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 445 nodes · 1040 edges · 26 communities (21 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.85)
- Token cost: unavailable — Codex agent tools did not expose usage counts.

## Community Hubs (Navigation)
- [[_COMMUNITY_Conversion UI and History|Conversion UI and History]]
- [[_COMMUNITY_Matching and Context Rules|Matching and Context Rules]]
- [[_COMMUNITY_Dataset Generation Pipeline|Dataset Generation Pipeline]]
- [[_COMMUNITY_English Morphology Rules|English Morphology Rules]]
- [[_COMMUNITY_Dataset Loading and Validation|Dataset Loading and Validation]]
- [[_COMMUNITY_Engine and Validation Tests|Engine and Validation Tests]]
- [[_COMMUNITY_Architecture and Platform Delivery|Architecture and Platform Delivery]]
- [[_COMMUNITY_Dictionary and Reference Pages|Dictionary and Reference Pages]]
- [[_COMMUNITY_Converter Engine Methods|Converter Engine Methods]]
- [[_COMMUNITY_Diagnostics Dashboard|Diagnostics Dashboard]]
- [[_COMMUNITY_Feedback API Storage|Feedback API Storage]]
- [[_COMMUNITY_Feedback Reports UI|Feedback Reports UI]]
- [[_COMMUNITY_Offline Service Worker|Offline Service Worker]]
- [[_COMMUNITY_Army Emblem Artwork|Army Emblem Artwork]]
- [[_COMMUNITY_Nested App Icon Design|Nested App Icon Design]]
- [[_COMMUNITY_Next.js Build Configuration|Next.js Build Configuration]]
- [[_COMMUNITY_PostCSS Build Configuration|PostCSS Build Configuration]]
- [[_COMMUNITY_Tailwind Theme Configuration|Tailwind Theme Configuration]]
- [[_COMMUNITY_Electron Desktop Wrapper|Electron Desktop Wrapper]]
- [[_COMMUNITY_Primary App Icon Design|Primary App Icon Design]]
- [[_COMMUNITY_Large Primary App Icon|Large Primary App Icon]]
- [[_COMMUNITY_Large Nested App Icon|Large Nested App Icon]]

## God Nodes (most connected - your core abstractions)
1. `ConverterEngine` - 29 edges
2. `AbbreviationEntry` - 20 edges
3. `normalizeForMatch()` - 17 edges
4. `AbbreviationDataset` - 17 edges
5. `useDataset()` - 16 edges
6. `MorphMatcher` - 13 edges
7. `ConversionResult` - 12 edges
8. `Bangladesh Services Writing Assistant Documentation` - 12 edges
9. `PhraseTrie` - 11 edges
10. `ConversionDirection` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Bangladesh Services Writing Assistant Documentation` --references--> `DatasetProvider`  [EXTRACTED]
  E:/JSSDM_App/abbre/abb/service-abbreviation-converter/service-abbreviation-converter/README.md → E:/JSSDM_App/abbre/abb/service-abbreviation-converter/README.md
- `Local Text Processing` --conceptually_related_to--> `Deployed Application Server`  [INFERRED]
  E:/JSSDM_App/abbre/abb/service-abbreviation-converter/README.md → E:/JSSDM_App/abbre/abb/service-abbreviation-converter/platforms/README.md
- `Installable Offline PWA` --conceptually_related_to--> `Fully Offline Static Export`  [INFERRED]
  E:/JSSDM_App/abbre/abb/service-abbreviation-converter/README.md → E:/JSSDM_App/abbre/abb/service-abbreviation-converter/platforms/README.md
- `Bangladesh Services Writing Assistant Documentation` --references--> `Source-manual Review`  [EXTRACTED]
  E:/JSSDM_App/abbre/abb/service-abbreviation-converter/service-abbreviation-converter/README.md → E:/JSSDM_App/abbre/abb/service-abbreviation-converter/README.md
- `Capacitor Web Placeholder` --references--> `Deployed Application Server`  [EXTRACTED]
  E:/JSSDM_App/abbre/abb/service-abbreviation-converter/platforms/capacitor-mobile/www/index.html → E:/JSSDM_App/abbre/abb/service-abbreviation-converter/platforms/README.md

## Hyperedges (group relationships)
- **Single Dataset Across Loading Validation and Tests** — readme_dataset, readme_provider, readme_validator, readme_tests, readme_sw [EXTRACTED 1.00]
- **Shared Server-backed Platform Delivery** — platforms_shared, platforms_server, platforms_electron, platforms_capacitor, platforms_pwa [EXTRACTED 1.00]

## Communities (26 total, 5 thin omitted)

### Community 0 - "Conversion UI and History"
Cohesion: 0.06
Nodes (59): ConverterPage(), AmbiguityReview(), AmbiguityReviewProps, ConverterPanel(), countWords(), DEFAULT_FILTERS, downloadBlob(), readRememberedChoices() (+51 more)

### Community 1 - "Matching and Context Rules"
Cohesion: 0.1
Nodes (39): buildMeaningChoices(), createChoiceId(), getConflictPolicy(), sentenceAround(), ContextRuleMatcher, ContextualMatch, PrefixDefinition, PREFIXES (+31 more)

### Community 2 - "Dataset Generation Pipeline"
Cohesion: 0.05
Nodes (39): allKeys, annexProfiles, base, baseEntries, baseRules, baseWordOf(), byAbbreviation, entry (+31 more)

### Community 3 - "English Morphology Rules"
Cohesion: 0.11
Nodes (20): headWordWithRoot(), prefixWithRoot(), resolveCompound(), rootWithSuffix(), ExactExceptions, GeneratedMatch, MorphMatcher, deduplicate() (+12 more)

### Community 4 - "Dataset Loading and Validation"
Cohesion: 0.12
Nodes (23): metadata, RootLayout(), viewport, AppFooter(), AppHeader(), navigation, PwaRegister(), CATEGORIES (+15 more)

### Community 5 - "Engine and Validation Tests"
Cohesion: 0.11
Nodes (21): resolutionKeyForAll(), army, choice, meanings, resolved, result, unfiltered, unresolved (+13 more)

### Community 6 - "Architecture and Platform Delivery"
Cohesion: 0.09
Nodes (34): Capacitor Web Placeholder, capacitor.config.json server.url, Bangladesh Services Writing Assistant Documentation, Android Studio APK/AAB Packaging, Capacitor Android and iOS Wrapper, Electron Windows Wrapper, data/feedback.jsonl Issue Reports, Xcode TestFlight Distribution (+26 more)

### Community 7 - "Dictionary and Reference Pages"
Cohesion: 0.13
Nodes (15): AboutPage(), metadata, AboutContent(), Principle(), DatasetStatusPanel(), DictionaryEntryCard(), DictionaryTable(), JsonSummary() (+7 more)

### Community 9 - "Diagnostics Dashboard"
Cohesion: 0.39
Nodes (5): DiagnosticMetric(), DiagnosticsContent(), StatusIcon(), DiagnosticsPage(), metadata

### Community 10 - "Feedback API Storage"
Cohesion: 0.38
Nodes (5): clampString(), DATA_DIR, DATA_FILE, GET(), POST()

### Community 11 - "Feedback Reports UI"
Cohesion: 0.4
Nodes (3): FeedbackEntry, FeedbackReports(), metadata

### Community 12 - "Offline Service Worker"
Cohesion: 0.6
Nodes (3): APP_SHELL, copy, url

### Community 13 - "Army Emblem Artwork"
Cohesion: 0.5
Nodes (4): Green and Gold Circular Badge, Crossed Gold Swords, Army Emblem Icon, Gold Leaf Motif

### Community 14 - "Nested App Icon Design"
Cohesion: 0.5
Nodes (4): Converter Caption, Green and Gold Framed Layout, SA Converter App Icon, SA Monogram

### Community 19 - "Primary App Icon Design"
Cohesion: 0.67
Nodes (3): SA Converter App Icon, Converter Wordmark, SA Monogram

### Community 20 - "Large Primary App Icon"
Cohesion: 0.67
Nodes (3): SA Converter Large App Icon, Converter Wordmark in Large Icon, SA Monogram in Large Icon

### Community 21 - "Large Nested App Icon"
Cohesion: 0.67
Nodes (3): SA Monogram, Dark Green Gold and Cream Identity, SA Converter App Icon

## Knowledge Gaps
- **68 isolated node(s):** `{ app, BrowserWindow, shell }`, `here`, `project`, `outDir`, `legacy` (+63 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ConverterEngine` connect `Converter Engine Methods` to `Conversion UI and History`, `Matching and Context Rules`, `Engine and Validation Tests`?**
  _High betweenness centrality (0.052) - this node is a cross-community bridge._
- **Why does `MorphMatcher` connect `English Morphology Rules` to `Matching and Context Rules`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `AbbreviationDataset` connect `Dataset Loading and Validation` to `Conversion UI and History`, `Matching and Context Rules`, `Engine and Validation Tests`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **What connects `{ app, BrowserWindow, shell }`, `here`, `project` to the rest of the system?**
  _68 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Conversion UI and History` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Matching and Context Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._
- **Should `Dataset Generation Pipeline` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._

## Run limitations

Semantic extraction ran through six Codex agents. The agent tools did not expose token usage; extraction token usage and monetary cost are unavailable. The source includes a nested copy of the app; both trees were included. Non-code semantic nodes and AST nodes are merged by ID only, so matching names may remain separate.
