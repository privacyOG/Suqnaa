# Mobile platform release configuration

P1-09 commits the native Android and iOS project foundations while keeping signing material outside the repository. P1-10 adds secret-gated signed store artifact automation without moving signing credentials into source control.

## Stable application identity

Production uses `co.privacyx.suqnaa` on both Android and iOS. Debug uses `.debug`; the staging/Profile variant uses `.staging`. These identifiers are treated as stable release identities and must not be changed casually after external testing begins.

## Android variants and signing

- Debug is locally buildable and uses the platform debug signing behavior.
- Staging and Release use the dedicated release signing configuration.
- Any Gradle task containing `Staging` or `Release` fails before packaging unless all four `SUQNAA_ANDROID_*` signing variables are present.
- Keystores and credentials are not tracked. `.jks` and `.keystore` files remain ignored.
- Release enables code shrinking and resource shrinking; cleartext HTTP and application backup are disabled.
- Flutter's current AGP 9 compatibility flags are explicit in `android/gradle.properties`; remove them only after the Flutter Gradle plugin supports the AGP 9 new DSL and built-in Kotlin path directly.

Local release signing expects:

- `SUQNAA_ANDROID_KEYSTORE_PATH`
- `SUQNAA_ANDROID_KEYSTORE_PASSWORD`
- `SUQNAA_ANDROID_KEY_ALIAS`
- `SUQNAA_ANDROID_KEY_PASSWORD`

The CI release workflow stores the keystore itself as base64 in `SUQNAA_ANDROID_KEYSTORE_BASE64`, decodes it only into `$RUNNER_TEMP`, maps the remaining secrets to the existing Gradle signing variables, and deletes the temporary keystore in an `always()` cleanup step.

## iOS variants, SwiftPM, and signing

Flutter-standard Xcode configurations are retained:

- Debug → `co.privacyx.suqnaa.debug`
- Profile/staging → `co.privacyx.suqnaa.staging`
- Release → `co.privacyx.suqnaa`

The iOS runner uses Swift Package Manager for Flutter plugins. CocoaPods integration is intentionally absent from the committed project and workspace; do not add a Podfile or Pods project unless a future dependency has no approved SwiftPM path and the package-manager decision is reviewed explicitly.

The Runner project retains Flutter's canonical Runner target, project, Flutter-group, and Frameworks-build-phase identifiers because Flutter's SwiftPM migration tooling uses those template identifiers. The shared scheme runs `xcode_backend.sh prepare` before build and sets `$(SRCROOT)/Flutter/ephemeral/flutter_lldbinit` for both Run and Test debug actions.

Profile and Release use manual signing and may import `ios/Flutter/Signing.xcconfig`, which is ignored by Git. Certificates, private keys and provisioning profiles must never be committed. Unsigned simulator compilation is permitted in CI to validate the native project without exposing store credentials.

The signed iOS release workflow requires:

- `SUQNAA_IOS_DISTRIBUTION_P12_BASE64`
- `SUQNAA_IOS_DISTRIBUTION_P12_PASSWORD`
- `SUQNAA_IOS_APPSTORE_PROFILE_BASE64`
- `SUQNAA_IOS_TEAM_ID`

At runtime the workflow creates an ephemeral keychain, imports the distribution certificate, decodes the App Store provisioning profile, verifies that the profile team matches `SUQNAA_IOS_TEAM_ID`, installs the profile temporarily, and writes an ignored `ios/Flutter/Signing.xcconfig` containing only the team, `Apple Distribution` identity and profile name. The keychain, profile, certificate, decoded plist and signing xcconfig are removed in an `always()` cleanup step.

## Signed store release workflow

`.github/workflows/mobile-store-releases.yml` has two deliberately separate modes:

1. Pull requests run only the secret-free `release-contract` job. This validates that the release workflow still keeps signing secrets outside tracked files and that signed jobs remain manual-only.
2. `workflow_dispatch` can build Android, iOS, or both. The operator must supply `version_name` and a positive integer `build_number`.

Signed build jobs are guarded by `github.event_name == 'workflow_dispatch'`, so pull requests and forks cannot cause store credentials to be materialised. Repository workflow permissions are read-only.

Android produces `app-release.aab` plus a SHA-256 checksum. iOS uses Flutter's `ipa` archive command with App Store export mode and produces both `Runner.xcarchive` and the exported `.ipa`, plus SHA-256 checksums. Artifacts are retained for 14 days; signing inputs are never included in uploaded artifact paths.

Release version/build numbers are supplied explicitly at dispatch time. Reusing a store build number is an operator error and must be rejected by the relevant store; release operators should monotonically increase build numbers even when rebuilding the same marketing version.

## Secure local session storage

The Flutter client continues to use `flutter_secure_storage` as its token/session boundary. Platform implementations therefore use Android Keystore-backed storage and iOS Keychain-backed storage rather than plaintext preferences or source-controlled secrets.

## Deep links

Both platforms accept the verified HTTPS route `https://suqnaa.com/app/...` and the `suqnaa://app/...` fallback scheme. Android uses an auto-verified intent filter. iOS declares the associated domain `applinks:suqnaa.com` and the custom scheme in `Info.plist`.

Production deployment must publish the matching Android Digital Asset Links and Apple App Site Association files before verified links are considered operational.

## Permissions

Native manifests request only the capabilities currently used by the marketplace client: internet access, camera access and photo-library/image selection. Location, contacts, microphone and phone-state permissions are intentionally absent.

## Branding and splash

Brand source artwork is committed with the native projects and is used for launcher/app-icon and splash/launch resources. The source mark is intentionally deterministic so platform outputs can be regenerated without external design tooling.

## Validation

Ordinary repository tests run `scripts/validate-mobile-platforms.mjs`. The `Mobile Platform Builds` workflow additionally compiles:

- Android Debug on Linux using the pinned native toolchain.
- iOS Debug for the simulator on macOS with code signing disabled and Flutter plugins resolved through SwiftPM.

The platform validator rejects reintroduction of a CocoaPods Podfile/Pods workspace reference, missing Flutter canonical iOS IDs, missing SwiftPM prepare action, missing LLDB init configuration, or source-controlled signing material.

`scripts/validate-mobile-release-pipelines.mjs` separately checks the signed release contract, including manual-only signed jobs, required secret references, temporary Android/iOS signing paths, checksum generation, artifact upload paths, and unconditional cleanup of signing material.
