# Mobile store submission package

This directory is the source of truth for Suqnaa's Apple App Store and Google Play submission metadata, privacy disclosures, review declarations, screenshots and release evidence.

## Safety model

A green CI run does not by itself mean the application is ready for public store submission. Public submission is permitted only when `review/submission-evidence.json` is `ready`, every required evidence item is explicitly `approved`, screenshots are fully captured and reconciled, and `review/readiness.json` is `ready_for_public_submission`.

Until those conditions are true, `scripts/build-mobile-store-submission-bundle.mjs` emits a bundle with:

- `bundleType: candidate_not_for_public_submission`
- `submissionAllowed: false`
- `STATUS.txt` beginning with `CANDIDATE ONLY - NOT FOR PUBLIC STORE SUBMISSION`

The generated bundle is placed under `build/mobile-store-submission/`; it is a CI/release artifact and is not committed.

## Screenshot evidence

Approved screenshots are stored under `screenshots/<platform>/<locale>/` using the paths declared by `screenshots/manifest.json`.

After adding, replacing or removing screenshots, run:

```bash
node scripts/reconcile-mobile-store-screenshots.mjs
```

The reconciler records image dimensions and SHA-256 fingerprints. CI runs the same tool in `--check` mode and rejects stale manifest claims.

## Submission bundle

Build the deterministic Apple/Google operator bundle with:

```bash
node scripts/validate-mobile-store-readiness.mjs
node scripts/build-mobile-store-submission-bundle.mjs
sha256sum --check build/mobile-store-submission/SHA256SUMS
```

`submission-bundle.json` contains the localized metadata, privacy/data-safety declarations, content-rating candidates, compliance declarations, reviewer notes, screenshot manifest, readiness state, evidence ledger and SHA-256 hashes of every source file used to build it.

The `Mobile Store Submission Bundle` GitHub Actions workflow builds and retains this package as a short-lived artifact for operator review. Store-console credentials, reviewer passwords, signing certificates, provisioning profiles and private keys must never be added to this directory or to the generated bundle.

## Approval boundary

Evidence references should point to durable review records or approved artifacts, but secrets and credentials remain outside source control. P0-31 legal/Arabic review remains authoritative for policy approval; store-console configuration and reviewer credentials remain release-operator responsibilities.
