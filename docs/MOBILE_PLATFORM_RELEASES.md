# Mobile platform release configuration

P1-09 commits the native Android and iOS project foundations while keeping signing material outside the repository. P1-10 owns signed store artifact automation.

## Stable application identity

Production uses `co.privacyx.suqnaa` on both Android and iOS. Debug uses `.debug`; the staging/Profile variant uses `.staging`. These identifiers are treated as stable release identities and must not be changed casually after external testing begins.

## Android variants and signing

- Debug is locally buildable and uses the platform debug signing behavior.
- Staging and Release use the dedicated release signing configuration.
- Any Gradle task containing `Staging` or `Release` fails before packaging unless all four `SUQNAA_ANDROID_*` signing variables are present.
- Keystores and credentials are not tracked. `.jks` and `.keystore` files remain ignored.
- Release enables code shrinking and resource shrinking; cleartext HTTP and application backup are disabled.
- Flutter's current AGP 9 compatibility flags are explicit in `android/gradle.properties`; remove them only after the Flutter Gradle plugin supports the AGP 9 new DSL and built-in Kotlin path directly.

Expected external values:

- `SUQNAA_ANDROID_KEYSTORE_PATH`
- `SUQNAA_ANDROID_KEYSTORE_PASSWORD`
- `SUQNAA_ANDROID_KEY_ALIAS`
- `SUQNAA_ANDROID_KEY_PASSWORD`

## iOS variants, SwiftPM, and signing

Flutter-standard Xcode configurations are retained:

- Debug → `co.privacyx.suqnaa.debug`
- Profile/staging → `co.privacyx.suqnaa.staging`
- Release → `co.privacyx.suqnaa`

The iOS runner uses Swift Package Manager for Flutter plugins. CocoaPods integration is intentionally absent from the committed project and workspace; do not add a Podfile or Pods project unless a future dependency has no approved SwiftPM path and the package-manager decision is reviewed explicitly.

The Runner project retains Flutter's canonical Runner target, project, Flutter-group, and Frameworks-build-phase identifiers because Flutter's SwiftPM migration tooling uses those template identifiers. The shared scheme runs `xcode_backend.sh prepare` before build and sets `$(SRCROOT)/Flutter/ephemeral/flutter_lldbinit` for both Run and Test debug actions.

Profile and Release use manual signing and may import `ios/Flutter/Signing.xcconfig`, which is ignored by Git. Certificates, private keys and provisioning profiles must never be committed. Unsigned simulator compilation is permitted in CI to validate the native project without exposing store credentials.

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

The platform validator also rejects reintroduction of a CocoaPods Podfile/Pods workspace reference, missing Flutter canonical iOS IDs, missing SwiftPM prepare action, missing LLDB init configuration, or source-controlled signing material.

Store-signed Android App Bundles and iOS archives are deliberately deferred to P1-10, where signing secrets will be supplied only through the CI secret store.
