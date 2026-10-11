# Architecture

## Shared local conversion

Next.js App Router, React, TypeScript and Tailwind form the interface. ConverterEngine performs phrase matching, controlled morphology and document policies in a browser Worker, with synchronous fallback. The authority remains the three reviewed data layers and their source DOCX.

The runtime receives only a complete approved DatasetPackage. DatasetProvider immediately activates bundled data, then restores a validated locally installed package in consumer builds. The owner workspace starts with its current bundled approved package for version comparisons. Dynamic learned-pair and community-profile fetches have been removed from consumer conversion.

## Consumer and owner boundaries

scripts/build-consumer.mjs builds in .consumer-build without API or owner routes, then exports out/. The consumer routes are Converter, Dictionary and Settings; HistoryContent is embedded under Recent conversions. Tree shaking excludes owner review components from delivered route bundles.

The loopback owner launcher enables existing review/diagnostic APIs. src/proxy.ts denies them when owner mode is not enabled. Public distribution uses scripts/collector.mjs, whose only dynamic write is report submission. Public report listing and data editing do not exist in that service.

Electron serves the exported files through a secure local sac://app scheme with sandbox, context isolation and no Node integration in the renderer. Capacitor bundles the same export in its native assets without server.url. Mobile App, Filesystem and Share plugins provide resume notifications and report-file exports.

## Report lifecycle

reportSelection.ts maps source/output ranges through replacement offsets, including partial selections, unchanged gaps and repeated words. Sentence segmentation keeps unrelated document text out of reports. conversionFeedback.ts creates v2 evidence and normalizes older field names for review. Suggested selected forms are also expanded into the expected sentence for the existing Correction review workflow.

reportDiagnosis.ts runs isolated text, original scope/sentence, reviewed same-root variants and wider service/annex checks. It captures outputs, entry IDs, applied rules, confidence and warnings. ReportDiagnosisPanel repeats comparisons with the owner's current approved data. FeedbackReports groups examples while retaining every submitted sentence.

localStore.ts owns durable IndexedDB transactions and a persistent localStorage fallback. Named Web Locks serialize mutations across tabs, with per-name promise serialization inside a window where Web Locks is absent. reportOutbox.ts commits each submitted ID before delivery; interrupted sending states retry, failed requests remain queued, permanent rejections/configuration gaps require attention, and acknowledgements must match the report ID. FeedbackDelivery runs on startup, visibility/resume, reconnect and a bounded retry timer.

The collector writes and syncs a temporary report file, then exclusively hard-links it into its stable-ID location. Simultaneous retries yield one complete record and one deterministic receipt. Existing feedback.jsonl remains readable without destructive migration.

## Atomic updates

DatasetPackage includes all three layers, a canonical SHA-256 digest, a content-derived version and the exact engine version. Publishing and downloading use the same structural/composition validator. The publisher atomically replaces its package file after validation. The consumer commits current and previous packages together only after validation and activates after storage succeeds. Reports use separate records in the same durable database.

The service-worker manifest includes every exported asset. Installation succeeds only when all files cache successfully. Existing tabs keep their current worker until they close; old offline caches are cleared when the complete new worker activates.

## Retained local evidence

History keeps sac:conversion-history:v1. Personal meaning choices keep their existing profile storage. Legacy sharing/verdict keys are no longer read or sent. Optional contact details are saved only by an explicit remember action. Owner correction/proposal/learned stores and legacy report files are retained for source verification.
