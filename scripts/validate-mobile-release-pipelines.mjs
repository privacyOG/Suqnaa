import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const workflow = read('.github/workflows/mobile-store-releases.yml');
const androidGradle = read('apps/mobile/android/app/build.gradle.kts');
const iosRelease = read('apps/mobile/ios/Flutter/Release.xcconfig');
const mobileIgnore = read('apps/mobile/.gitignore');

assert.match(workflow, /^name: Mobile Store Releases$/m);
assert.match(workflow, /^  pull_request:$/m);
assert.match(workflow, /^  workflow_dispatch:$/m);
assert.doesNotMatch(workflow, /pull_request_target/);
assert.match(workflow, /permissions:\n  contents: read/);
assert.match(workflow, /cancel-in-progress: false/);

for (const input of ['platform', 'version_name', 'build_number']) {
  assert.match(workflow, new RegExp(`^      ${input}:`, 'm'));
}

assert.match(workflow, /android-app-bundle:/);
assert.match(workflow, /if: github\.event_name == 'workflow_dispatch'.*inputs\.platform == 'android'/);
for (const secret of [
  'SUQNAA_ANDROID_KEYSTORE_BASE64',
  'SUQNAA_ANDROID_KEYSTORE_PASSWORD',
  'SUQNAA_ANDROID_KEY_ALIAS',
  'SUQNAA_ANDROID_KEY_PASSWORD'
]) {
  assert.match(workflow, new RegExp(`secrets\\.${secret}`));
}
assert.match(workflow, /RUNNER_TEMP\/suqnaa-release\.jks/);
assert.match(workflow, /base64 --decode/);
assert.match(workflow, /flutter build appbundle --release/);
assert.match(workflow, /sha256sum build\/app\/outputs\/bundle\/release\/app-release\.aab/);
assert.match(workflow, /actions\/upload-artifact@v4/);
assert.match(workflow, /Remove temporary Android signing material[\s\S]*?if: always\(\)[\s\S]*?rm -f "\$RUNNER_TEMP\/suqnaa-release\.jks"/);

for (const envName of [
  'SUQNAA_ANDROID_KEYSTORE_PATH',
  'SUQNAA_ANDROID_KEYSTORE_PASSWORD',
  'SUQNAA_ANDROID_KEY_ALIAS',
  'SUQNAA_ANDROID_KEY_PASSWORD'
]) {
  assert.match(androidGradle, new RegExp(`System\\.getenv\\("${envName}"\\)`));
}
assert.match(androidGradle, /Release signing credentials must be supplied outside the repository/);
assert.doesNotMatch(androidGradle, /signingConfig\s*=\s*signingConfigs\.getByName\("debug"\)/);

assert.match(workflow, /ios-app-store-archive:/);
assert.match(workflow, /if: github\.event_name == 'workflow_dispatch'.*inputs\.platform == 'ios'/);
for (const secret of [
  'SUQNAA_IOS_DISTRIBUTION_P12_BASE64',
  'SUQNAA_IOS_DISTRIBUTION_P12_PASSWORD',
  'SUQNAA_IOS_APPSTORE_PROFILE_BASE64',
  'SUQNAA_IOS_TEAM_ID'
]) {
  assert.match(workflow, new RegExp(`secrets\\.${secret}`));
}
assert.match(workflow, /RUNNER_TEMP\/suqnaa-build\.keychain-db/);
assert.match(workflow, /security import .* -T \/usr\/bin\/codesign/);
assert.match(workflow, /security set-key-partition-list/);
assert.match(workflow, /Provisioning profile team does not match SUQNAA_IOS_TEAM_ID/);
assert.match(workflow, /cat > ios\/Flutter\/Signing\.xcconfig/);
assert.match(workflow, /DEVELOPMENT_TEAM=\$SUQNAA_IOS_TEAM_ID/);
assert.match(workflow, /CODE_SIGN_IDENTITY=Apple Distribution/);
assert.match(workflow, /PROVISIONING_PROFILE_SPECIFIER=\$profile_name/);
assert.match(workflow, /flutter build ipa --release --export-method app-store/);
assert.match(workflow, /apps\/mobile\/build\/ios\/archive\/Runner\.xcarchive/);
assert.match(workflow, /apps\/mobile\/build\/ios\/ipa\/\*\.ipa/);
assert.match(workflow, /Remove temporary iOS signing material[\s\S]*?if: always\(\)[\s\S]*?rm -f ios\/Flutter\/Signing\.xcconfig/);
assert.match(workflow, /security delete-keychain/);

assert.match(iosRelease, /#include\? "Signing\.xcconfig"/);
assert.match(mobileIgnore, /ios\/Flutter\/Signing\.xcconfig/);
assert.match(mobileIgnore, /\*\.p12/);
assert.match(mobileIgnore, /\*\.mobileprovision/);
assert.match(mobileIgnore, /\*\.jks/);

for (const source of [workflow, androidGradle, iosRelease]) {
  assert.doesNotMatch(source, /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/);
  assert.doesNotMatch(source, /AKIA[0-9A-Z]{16}/);
}

console.log('Mobile store release pipeline contract passed.');
