## 1. Server: emit placeholders

- [x] 1.1 In `generate/route.ts`, build the media section with `Image n: [[IMG_n]]` instead of the URL; instruct the model to use `[[IMG_n]]` as the markdown image URL.
- [x] 1.2 In `refine/route.ts`, same placeholder treatment for the media section.

## 2. Client: resolve placeholders

- [x] 2.1 In `app/lib/api.ts`, add a shared helper that resolves `[[IMG_n]]` → `media[n-1].url` with boundary buffering for split tokens.
- [x] 2.2 Apply it in `streamReleaseNote` and `streamRefineNote`, flushing the tail at stream end.

## 3. Validate

- [x] 3.1 Local: worst case (2 large tickets, detailed, 4 real S3 images) — confirm all images render (no raw `[[IMG_n]]`, no truncated URLs).
- [x] 3.2 Test a placeholder split across chunk boundaries resolves correctly.
- [x] 3.3 Deploy and verify in production: images present, time still well under 30s.

## 4. Wrap up

- [x] 4.1 Commit + push (deploys to Amplify). Archive the change.
