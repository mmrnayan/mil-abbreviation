# Service Abbreviation Converter

A local converter and searchable dictionary based on Joint Services Staff Duties Manual 2022, Section 16. The website, Windows installer and Android/iPhone projects share the same engine and versioned approved data.

## Users

Converter and Dictionary are the main tabs. Recent conversions are inside Converter; the existing latest-50 history storage is preserved. The gear opens appearance, optional contacts, reports and updates.

Select text in either input or output, or open conversion details or a dictionary entry, then choose Report this. A report contains the selected word/phrase, its sentence, actual output, scope, applied meaning choices, rule evidence and versions. A suggested form, explanation, email and introduction are optional. Only explicit submissions enter the durable queue. Meaning preferences and ordinary conversions remain local.

Reports are committed to IndexedDB before delivery (localStorage fallback where IndexedDB is unavailable). Delivery resumes on launch, reconnect, foreground and native app resume. Waiting, Sending, Sent and Needs attention are visible in Settings. Stable IDs and durable server receipts prevent duplicate delivery. Unsent reports can be cancelled or exported/imported; native exports use the phone's share sheet.

## Run the local owner workspace

Requires Node.js 22+ and npm. Owner tools require no app login and run on loopback.

    npm install
    npm run dev

For production locally:

    npm run build
    npm start

The gear links to Issue reports, Correction review and Diagnostics in the owner build. Issue reports combine the existing data/feedback.jsonl with durable new data/reports/*.json records. Import accepts legacy JSON/JSONL and consumer queue exports. No evidence files are deleted during this migration.

Reports group by root/word, failure pattern and reported version. Compare accuracy checks reruns the word alone, sentence, approved related forms and broader scope against the owner's bundled approved version. Unknown or insufficiently verified matches require source review. Corrections and legacy learned-conversion evidence remain in the local owner workspace; consumers no longer fetch learned pairs or community profiles.

## Build and serve the consumer app

    npm run build:consumer
    npm run serve:consumer

This exports only /, /dictionary and /about into out/. The collector defaults to 127.0.0.1:3108. For a hosted service, set HOST and PORT as appropriate behind your HTTPS deployment. Run the collector, not the local Next owner server, on the public service.

The collector accepts POST /api/feedback and serves GET /data/dataset-package.json plus consumer static assets. It has no report-listing, correction, proposal, owner-review or data-editing endpoints. Back up data/ on the collector; import its evidence files into the local owner workspace using your hosting management access.

For installers, set NEXT_PUBLIC_SERVICE_ORIGIN to the collector's HTTPS origin before build:consumer. An unset origin uses the website's own origin on the web. Native builds without an origin still convert and queue reports offline, and explicitly show that online delivery is not configured; reports can be exported. No remote page is required to launch an installer.

See platforms/README.md for Windows, Android and iPhone build commands.

## Approved data and updates

Edit the three curated source layers in public/data/:

- abbreviations.base.json: verified pairs and DOCX source locations.
- abbreviation-rules.json: root permissions and document policies.
- abbreviation-overrides.json: reviewed exceptions, splits and extensions.

Verify fixes against ABBREVIATIONS AND SYMBOLS.docx. Add regression cases with scripts/add-gold-case.mjs and run npm run check. Existing source repair can be audited with scripts/repair-source-data.py --check.

npm run package:data composes and validates all layers and atomically writes dataset-package.json. Its content hash identifies the version, and its engineVersion must match the installed app. Publishing this approved package to the collector makes it available through Check approved updates. Reports and review proposals alone never modify this package.

The consumer validates the whole downloaded package before committing current and previous versions together in one transaction. Invalid or interrupted downloads preserve working data and the report queue. Restore previous dataset is available in Settings. New engine releases require rebuilding the app/installer; a dataset update cannot silently change engine behavior.

The web service worker installs the complete exported asset manifest as one cache. A failed install does not replace working offline files. New app workers activate after existing tabs close, preserving consistent assets for open sessions. First-launch offline operation is provided by bundled installers; browsers require a complete online visit first.

## Verification

    npm run check
    npm run build:consumer

The suite covers conversion/source rules, report range mapping, sentence minimization, legacy reading, durable queue retries, acknowledgements, duplicate collection, public endpoint isolation and invalid dataset retention. Windows also provides an offline startup smoke check:

    platforms/electron-win/dist/win-unpacked/Abbreviation Converter.exe --offline-smoke-test

That check uses an isolated profile, hides the window and blocks all HTTP/HTTPS requests. Physical Android/iPhone airplane-mode, native sharing and distribution signing remain device/platform acceptance checks.

No release tag, public deployment, Apple upload or production signing is performed by these local build commands.
