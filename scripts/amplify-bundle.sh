#!/usr/bin/env bash
# Packs the Angular SSR build into the Amplify Hosting deployment layout.
set -euo pipefail
DIST=dist/ibd-release-notes
OUT=.amplify-hosting
rm -rf "${OUT:?}"
mkdir -p "$OUT/compute/default"
cp -r "$DIST/server/." "$OUT/compute/default/"
cp -r "$DIST/browser" "$OUT/compute/default/browser"
cp -r "$DIST/browser" "$OUT/static"
cp deploy-manifest.json "$OUT/deploy-manifest.json"
