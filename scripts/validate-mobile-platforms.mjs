import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const androidGradle = read('apps/mobile/android/app/build.gradle.kts');
const androidManifest = read('apps/mobile/android/app/src/main/AndroidManifest.xml');
const mainActivity = read('apps/mobile/android/app/src/main/kotlin/co/privacyx/suqnaa/MainActivity.kt');
const iosInfo = read('apps/mobile/ios/Runner/Info.plist');
const iosEntitlements = read('apps/mobile/ios/Runner/Runner.entitlements');
const iosRelease = read('apps/mobile/ios/Flutter/Release.xcconfig');
const iosProfile = read('apps/mobile/ios/Flutter/Profile.xcconfig');
const iosDebug = read('apps/mobile/ios/Flutter/Debug.xcconfig');
const mobileIgnore = read('apps/mobile/.gitignore');
const pubspec = read('apps/mobile/pubspec.yaml');

assert.match(androidGradle, /applicationId = "co\.privacyx\.suqnaa"/);
assert.match(androidGradle, /namespace = "co\.privacyx\.suqnaa"/);
assert.match(androidGradle, /SUQNAA_ANDROID_KEYSTORE_PATH/);
assert.match(androidGradle, /Release signing credentials must be supplied outside the repository/);
assert.match(androidGradle, /isMinifyEnabled = true/);
assert.match(androidGradle, /isShrinkResources = true/);
assert.match(androidGradle, /applicationIdSuffix = "\.staging"/);
assert.match(androidGradle, /applicationIdSuffix = "\.debug"/);

assert.match(androidManifest, /android:allowBackup="false"/);
assert.match(androidManifest, /android:usesCleartextTraffic="false"/);
assert.match(androidManifest, /android\.permission\.CAMERA/);
assert.match(androidManifest, /android\.permission\.READ_MEDIA_IMAGES/);
assert.match(androidManifest, /android:scheme="https" android:host="suqnaa\.com" android:pathPrefix="\/app"/);
assert.match(androidManifest, /android:scheme="suqnaa" android:host="app"/);
for (const prohibitedPermission of [
  'ACCESS_FINE_LOCATION',
  'ACCESS_COARSE_LOCATION',
  'READ_CONTACTS',
  'RECORD_AUDIO',
  'READ_PHONE_STATE'
]) {
  assert.doesNotMatch(androidManifest, new RegExp(prohibitedPermission));
}
assert.match(mainActivity, /^package co\.privacyx\.suqnaa/m);

assert.match(iosInfo, /<string>Suqnaa<\/string>/);
assert.match(iosInfo, /NSAllowsArbitraryLoads[\s\S]*?<false\/>/);
assert.match(iosInfo, /NSCameraUsageDescription/);
assert.match(iosInfo, /NSPhotoLibraryUsageDescription/);
assert.match(iosInfo, /<string>suqnaa<\/string>/);
assert.match(iosEntitlements, /applinks:suqnaa\.com/);
assert.match(iosRelease, /PRODUCT_BUNDLE_IDENTIFIER=co\.privacyx\.suqnaa/);
assert.match(iosRelease, /#include\? "Signing\.xcconfig"/);
assert.match(iosProfile, /PRODUCT_BUNDLE_IDENTIFIER=co\.privacyx\.suqnaa\.staging/);
assert.match(iosDebug, /PRODUCT_BUNDLE_IDENTIFIER=co\.privacyx\.suqnaa\.debug/);

assert.match(mobileIgnore, /ios\/Flutter\/Signing\.xcconfig/);
assert.match(mobileIgnore, /\*\.p12/);
assert.match(mobileIgnore, /\*\.mobileprovision/);
assert.match(mobileIgnore, /\*\.jks/);
assert.match(pubspec, /flutter_secure_storage:/);

for (const source of [androidGradle, androidManifest, iosInfo, iosRelease, iosProfile, iosDebug]) {
  assert.doesNotMatch(source, /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/);
}

console.log('Mobile platform hardening surface passed.');
