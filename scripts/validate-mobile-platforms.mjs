import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => existsSync(new URL(path, root));

const androidGradle = read('apps/mobile/android/app/build.gradle.kts');
const androidSettings = read('apps/mobile/android/settings.gradle.kts');
const androidProperties = read('apps/mobile/android/gradle.properties');
const androidManifest = read('apps/mobile/android/app/src/main/AndroidManifest.xml');
const mainActivity = read('apps/mobile/android/app/src/main/kotlin/co/privacyx/suqnaa/MainActivity.kt');
const iosInfo = read('apps/mobile/ios/Runner/Info.plist');
const iosEntitlements = read('apps/mobile/ios/Runner/Runner.entitlements');
const iosRelease = read('apps/mobile/ios/Flutter/Release.xcconfig');
const iosProfile = read('apps/mobile/ios/Flutter/Profile.xcconfig');
const iosDebug = read('apps/mobile/ios/Flutter/Debug.xcconfig');
const iosProject = read('apps/mobile/ios/Runner.xcodeproj/project.pbxproj');
const iosWorkspace = read('apps/mobile/ios/Runner.xcworkspace/contents.xcworkspacedata');
const iosScheme = read('apps/mobile/ios/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme');
const iosPodfile = read('apps/mobile/ios/Podfile');
const iosAppDelegate = read('apps/mobile/ios/Runner/AppDelegate.swift');
const iosIconCatalog = read('apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/Contents.json');
const mobileIgnore = read('apps/mobile/.gitignore');
const pubspec = read('apps/mobile/pubspec.yaml');

assert.match(androidSettings, /com\.android\.application.*9\.0\.1/);
assert.match(androidSettings, /org\.jetbrains\.kotlin\.android.*2\.3\.20/);
assert.match(androidProperties, /^android\.newDsl=false$/m);
assert.match(androidProperties, /^android\.builtInKotlin=false$/m);
assert.match(androidGradle, /applicationId = "co\.privacyx\.suqnaa"/);
assert.match(androidGradle, /namespace = "co\.privacyx\.suqnaa"/);
assert.match(androidGradle, /minSdk = flutter\.minSdkVersion/);
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

for (const requiredAndroidPath of [
  'apps/mobile/android/build.gradle.kts',
  'apps/mobile/android/gradle.properties',
  'apps/mobile/android/gradle/wrapper/gradle-wrapper.properties',
  'apps/mobile/android/app/proguard-rules.pro',
  'apps/mobile/android/app/src/main/res/values/styles.xml',
  'apps/mobile/android/app/src/main/res/drawable/brand_mark.xml'
]) {
  assert.ok(exists(requiredAndroidPath), `${requiredAndroidPath} must be committed`);
}

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
assert.match(iosProject, /baseConfigurationReference = B20000000000000000000003 \/\* Release\.xcconfig \*\//);
assert.match(iosProject, /CODE_SIGN_STYLE = Manual/);
assert.match(iosProject, /xcode_backend\.sh\\" build/);
assert.match(iosWorkspace, /Runner\.xcodeproj/);
assert.match(iosWorkspace, /Pods\/Pods\.xcodeproj/);
assert.match(iosScheme, /buildConfiguration="Profile"/);
assert.match(iosScheme, /buildConfiguration="Release"/);
assert.match(iosScheme, /<MacroExpansion>[\s\S]*?<BuildableReference[\s\S]*?BlueprintName="Runner"/);
assert.match(iosPodfile, /platform :ios, '15\.0'/);
assert.match(iosPodfile, /flutter_install_all_ios_pods/);
assert.match(iosAppDelegate, /GeneratedPluginRegistrant\.register/);
assert.match(iosIconCatalog, /AppIcon-1024\.svg/);

for (const requiredIosPath of [
  'apps/mobile/ios/Runner.xcodeproj/project.pbxproj',
  'apps/mobile/ios/Runner.xcworkspace/contents.xcworkspacedata',
  'apps/mobile/ios/Runner.xcodeproj/xcshareddata/xcschemes/Runner.xcscheme',
  'apps/mobile/ios/Runner/AppDelegate.swift',
  'apps/mobile/ios/Runner/Runner-Bridging-Header.h',
  'apps/mobile/ios/Runner/Assets.xcassets/Contents.json',
  'apps/mobile/ios/Runner/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.svg',
  'apps/mobile/ios/Runner/Assets.xcassets/LaunchBrand.imageset/launch-brand.svg'
]) {
  assert.ok(exists(requiredIosPath), `${requiredIosPath} must be committed`);
}

assert.match(mobileIgnore, /ios\/Flutter\/Signing\.xcconfig/);
assert.match(mobileIgnore, /\*\.p12/);
assert.match(mobileIgnore, /\*\.mobileprovision/);
assert.match(mobileIgnore, /\*\.jks/);
assert.match(pubspec, /flutter_secure_storage:/);

for (const source of [
  androidGradle,
  androidManifest,
  iosInfo,
  iosRelease,
  iosProfile,
  iosDebug,
  iosProject,
  iosPodfile
]) {
  assert.doesNotMatch(source, /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/);
}

console.log('Mobile platform hardening surface passed.');
