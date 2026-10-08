# IBD Release Notes

Angular 22 SSR rewrite of the IBD release-notes tool (in progress).

- The previous Next.js app lives untouched in [`legacy/`](legacy/README.md) as reference while features are ported.
- Hosting: AWS Amplify (WEB_COMPUTE) using the Amplify Hosting deployment specification.

## Run locally

```bash
npm install
npm start                       # dev server on :4200
npm run build && npm run serve:ssr   # SSR server on :3000
```

## Deploy (Amplify)

`amplify.yml` builds the app and runs `scripts/amplify-bundle.sh`, which packs
`dist/ibd-release-notes` into `.amplify-hosting/` (`static/`, `compute/default/`,
`deploy-manifest.json`). The compute entry `server.mjs` listens on port 3000.

Allowed SSR hosts are set in `angular.json` (`allowedHosts`).
