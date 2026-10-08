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
RUNTIME_VARS="ADMIN_TOKEN_HASH JIRA_BASE_URL JIRA_EMAIL JIRA_API_TOKEN NOTION_API_KEY NOTION_DATABASE_ID NOTION_DATABASE_ID_TEST NOTION_DATABASE_ID_PROD"
: > "$OUT/compute/default/.env"
for name in $RUNTIME_VARS; do
  if [ -n "${!name:-}" ]; then
    printf '%s=%s\n' "$name" "${!name}" >> "$OUT/compute/default/.env"
  fi
done
