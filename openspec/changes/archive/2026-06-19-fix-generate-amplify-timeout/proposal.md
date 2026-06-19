## Why

The `/api/release-notes/generate` endpoint returns a `500 (Internal Server Error)` in production (Amplify) whenever a release note takes longer than ~30s to produce. Amplify's SSR Lambda buffers the entire SSE response (measured TTFB == total in production) and is killed at exactly 30s. A "detailed" note built from two large Jira tickets generates ~2900 chunks and takes ~61s locally, so it always exceeds the limit. The same risk applies to `/api/release-notes/refine`, which shares the streaming pattern.

## What Changes

- Bound the OpenAI completion so total generation time fits comfortably under Amplify's 30s Lambda budget (target ≤ ~25s):
  - Add a `max_tokens` cap to the OpenAI request in `generate` and `refine`.
  - Right-size the "detailed" note instructions so they no longer demand a 2000+ word (60s+) output, while keeping the note useful and complete.
- Keep the existing SSE/stream code path (Amplify buffers it anyway, but local dev and any future streaming-capable host still benefit).
- Surface a clear error message instead of a silent 500 when OpenAI is slow or the upstream fails.

## Capabilities

### New Capabilities
- `release-note-generation`: Generating and refining a release note from Jira context and media via OpenAI, within the hosting platform's request-time budget.

### Modified Capabilities
<!-- none: no existing specs -->

## Impact

- Code: `app/api/release-notes/generate/route.ts`, `app/api/release-notes/refine/route.ts`.
- Behavior: "detailed" release notes become more concise (bounded length) so they reliably complete within the Amplify 30s limit.
- No infra changes required; no new dependencies.
