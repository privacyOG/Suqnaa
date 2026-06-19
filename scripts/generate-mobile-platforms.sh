#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../apps/mobile"

flutter create \
  --platforms=android,ios \
  --org com.suqnaa \
  --project-name suqnaa \
  .

echo "Generated Android and iOS platform folders for Suqnaa."
echo "Android application id target: com.suqnaa.app"
echo "iOS bundle id target: com.suqnaa.app"
echo "Review native signing and store settings before release builds."
