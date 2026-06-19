# Suqnaa mobile app

Flutter app shell for Android and iOS.

## Generate native Android/iOS folders

From the repository root:

```bash
./scripts/generate-mobile-platforms.sh
```

Target identifiers:

- Android package: `com.suqnaa.app`
- iOS bundle identifier: `com.suqnaa.app`
- Display name: `Suqnaa`

After native folders are generated, review Android signing, iOS signing, app icons, permissions, and store metadata before creating release builds.

## Local run

```bash
cd apps/mobile
flutter pub get
flutter run
```

## Current status

The app currently contains the initial home screen, provisional brand colors, category shortcuts, and marketplace preview UI. The next implementation step is to connect it to the API for categories, listings, authentication, and user profiles.
