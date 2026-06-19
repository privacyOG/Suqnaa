#!/usr/bin/env bash
set -euo pipefail

OWNER="${1:-privacyOG}"
REPO="Suqnaa"
VISIBILITY="${2:-private}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is required: https://cli.github.com/"
  exit 1
fi

gh repo create "$OWNER/$REPO" --"$VISIBILITY" --source . --remote origin --push
