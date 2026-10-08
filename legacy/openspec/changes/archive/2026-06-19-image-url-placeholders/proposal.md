## Why

Uploaded images do not reliably appear in the generated release note. The S3 upload endpoint returns a long pre-signed URL (~600 chars ≈ ~200 tokens each). The model echoes these giant URLs into the markdown — usually in a "Screenshots" section at the end — and runs out of its token budget mid-URL, so the image markdown is truncated and the image never renders. Confirmed in production: a worst case with 4 images produced 0 renderable images.

## What Changes

- The `generate` and `refine` endpoints SHALL pass the model a short placeholder token (e.g. `[[IMG_1]]`, `[[IMG_2]]`) for each media item instead of the full pre-signed S3 URL, and instruct the model to use that exact token as the markdown image URL.
- The client (`streamReleaseNote`, `streamRefineNote`) SHALL replace each `[[IMG_n]]` placeholder with the real media URL as the stream arrives, handling placeholders that span chunk boundaries.
- Net effect: images render reliably, ~200 tokens per image are freed for actual content, and the timeout margin improves further.

## Capabilities

### Modified Capabilities
- `release-note-generation`: how media URLs are represented to the model and resolved on the client.

## Impact

- Code: `app/api/release-notes/generate/route.ts`, `app/api/release-notes/refine/route.ts`, `app/lib/api.ts`.
- No infra changes; pre-signed URLs are still used, just resolved client-side instead of being emitted by the model.
