# Offline installers

All platforms use the same static consumer export, engine and approved dataset. No installer loads a remote page.

## Shared build

Requires Node.js 22+.

    npm install
    npm run build:consumer

For online report delivery and data updates, set NEXT_PUBLIC_SERVICE_ORIGIN to your HTTPS collector origin before the shared build. Leave it unset for an offline preview; Settings then explains that reports must be exported until a configured installer is built. The website can use its own collector origin.

## Windows

    cd platforms/electron-win
    npm install
    cd ../..
    npm run package:windows

Outputs: platforms/electron-win/dist/Abbreviation Converter Setup 1.3.0.exe and Abbreviation Converter 1.3.0.exe. The current preview binaries are unsigned. Configure your Windows signing certificate for public signed releases.

The packaged executable supports --offline-smoke-test: an isolated hidden profile loads bundled files while HTTP/HTTPS requests are blocked. Standard operation uses the persistent application profile.

## Android

    cd platforms/capacitor-mobile
    npm install
    cd ../..
    npm run package:mobile
    powershell -File scripts/build-android.ps1 -Configuration Debug

Requires JDK 21, Android SDK API 36 and the Gradle wrapper. Set JAVA_HOME and ANDROID_HOME, or use the workspace's portable JDK/standard user SDK location. The command produces platforms/capacitor-mobile/android/app/build/outputs/apk/debug/app-debug.apk for local testing.

For distribution, configure your release keystore in Android Studio/Gradle and build Release; keep signing credentials outside the repository. Debug signing is for pilot testing and does not establish your production signing identity.

## iPhone

Run the shared build and package:mobile first, then transfer the project to a Mac, install npm dependencies and sync iOS again there. Open platforms/capacitor-mobile/ios/App/App.xcodeproj in Xcode 26+.

Choose your Apple team and provisioning, test on an iPhone in airplane mode, Archive, and distribute through TestFlight. App Store distribution follows the pilot. This Windows workspace cannot compile or sign the iOS app.

The native project includes the bundled app, App/Filesystem/Share plugins and the required file-timestamp privacy manifest. Review App Store privacy declarations for the explicitly submitted report sentence and optional contact fields before publishing.

## Platform acceptance

On a fresh installation with network disabled, verify converter, dictionary, recent history and optional-field-free reporting. Restart and check that queued reports persist. Restore connectivity with a configured collector and verify one acknowledged server record per stable report ID. Verify native export/share and import, and invalid/interrupted dataset updates without losing reports.

Windows offline startup, Android compilation and the shared regression suite can be checked here. Physical mobile testing and Apple distribution require the corresponding devices and signing environment.
