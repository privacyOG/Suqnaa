# Repository integrity policy

This repository has one permitted authorship and attribution identity: `privacyOG`.

## Required rules

- Commit authors must be `privacyOG`.
- Source files, documentation, configuration, tests, workflows, commit messages, pull requests, and issue content must not contain restricted vendor, product, automated-content, or attribution markers.
- Co-author trailers and automated attribution are not permitted.
- Credentials, secrets, private keys, and signing material must remain outside the repository.
- Every implementation branch must pass the repository policy command before review.

## Validation

Run the policy locally from the repository root:

```bash
pnpm policy
```

The CI and preflight workflows run the same command. The check scans tracked paths and text content, then validates the commits in the configured comparison range.

Policy failures must be corrected before a pull request is opened or merged.
