# Mobile release setup

## App identifiers

Use stable identifiers early because changing them after release is painful.

- Android application id: `com.suqnaa.app`
- iOS bundle identifier: `com.suqnaa.app`
- App display name: `Suqnaa`

## Android release checklist

1. Generate Android files with `./scripts/generate-mobile-platforms.sh`.
2. Configure `applicationId` as `com.suqnaa.app`.
3. Create a release keystore outside the repository.
4. Store signing secrets in CI or local environment variables only.
5. Configure launcher icons using the final exported app icon.
6. Build with `flutter build appbundle --release`.

## iOS release checklist

1. Generate iOS files with `./scripts/generate-mobile-platforms.sh`.
2. Set bundle identifier to `com.suqnaa.app`.
3. Configure Apple Developer team signing.
4. Add app icon set from final production artwork.
5. Configure privacy descriptions before requesting permissions.
6. Build/archive through Xcode or CI.

## Brand provision

The current icon is provisional. Keep source artwork replaceable and regenerate platform icons when the brand is final.
