#!/usr/bin/env bash
# Checks to pass before committing. treefmt formats in place and fails if it
# changed anything, so a failed run leaves the tree formatted; rerun to proceed.
set -euo pipefail
cd "$(dirname "$0")/.."

treefmt --fail-on-change
npx astro check
npx vitest run
