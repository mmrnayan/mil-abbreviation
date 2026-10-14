Mobile UI/UX redesign (shared web UI, applies to Android + iOS Capacitor apps) with bottom tab navigation, then browser preview + Android APK build/run.

## 1. Bottom tab bar (mobile navigation)
- Rework `AppHeader.tsx`: remove the current `#mobile-navigation` 2-column grid (lines ~108–125); on screens below `lg`, render a fixed bottom tab bar with three items — Converter (`/`), Dictionary (`/dictionary`), Settings (`/about`) — each an icon + label, active state highlighted (gold on forest), ~56px tall with `pb-[env(safe-area-inset-bottom)]` for iPhone home indicator.
- Add `main` bottom padding on mobile (`pb-20 lg:pb-0`, via layout or globals.css) so content isn't hidden behind the bar; hide the redundant header Settings/theme icon-row on mobile where the tab bar covers it (keep theme toggle accessible in Settings page).
- Icons from lucide (`ArrowLeftRight`/`Repeat`, `BookOpen`, `Settings`); ensure ≥44px touch targets.

## 2. Native Capacitor polish
- **Status bar**: add `@capacitor/status-bar` to `platforms/capacitor-mobile/package.json`; style it to match the header (dark forest background, light text) on app start in `AboutContent`-like bootstrap (`Capacitor.isNativePlatform()` guard, try/catch so web is unaffected).
- **Android back button**: register `App.addListener("backButton")` (in `FeedbackDelivery` bootstrap or a small `NativeBridge` client component) — closes the ambiguity modal if open, otherwise navigates back to `/` (exit only from `/` is left to default behavior).
- **Safe areas**: extend existing `env(safe-area-inset-*)` handling so the sticky header clears the iOS notch and the footer clears the home indicator in the native webview.

## 3. Mobile layout polish (ConverterPanel + globals.css)
- Ensure toolbar icon buttons are ≥44px tap area on touch; compact the DirectionSelector on small screens.
- Keep the existing `max-width: 520px` media block; adjust footer padding so the bottom tab bar never overlaps content; verify dark mode contrast.

## 4. Verification & run
1. `npm run lint` + `npm test` (276 tests) + consumer build.
2. **Browser preview**: serve `out/` via the existing static server (`scripts/static-server.mjs`) and check the phone-width layout (390px) — header, tabs, converter, dictionary, settings — with the browser-use skill screenshots.
3. **Android**: `npm run build:consumer` → `npm run package:mobile` (needs no BASE_PATH — native bundles at root; confirm script behavior) → `scripts/build-android.ps1` debug APK. Check `adb devices`; if a device/emulator is present, install the APK and launch it.
4. Commit and push (web deploys update automatically; iOS project picks up changes on next Mac build).

## Notes
- iOS itself can't be compiled/run on this Windows machine — the UI changes apply to it automatically since it's the same web bundle; final iOS build still requires a Mac + Xcode per `platforms/README.md`.