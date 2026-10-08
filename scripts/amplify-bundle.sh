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
# Amplify env vars only exist at build time; pass the ones the server needs at runtime.
if [ -n "${ADMIN_TOKEN_HASH:-}" ]; then
  printf 'ADMIN_TOKEN_HASH=%s\n' "$ADMIN_TOKEN_HASH" > "$OUT/compute/default/.env"
fi
