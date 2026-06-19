## 1. Bound generation in `generate`

- [x] 1.1 Add a per-type `max_tokens` cap to the OpenAI request in `app/api/release-notes/generate/route.ts` (detailed > standard > brief).
- [x] 1.2 Right-size the "detailed" instruction: remove the "AT LEAST 2000+ words / do NOT condense" demand; ask for thorough-but-concise coverage aligned with the cap.
- [x] 1.3 Keep the SSE passthrough unchanged.

## 2. Bound generation in `refine`

- [x] 2.1 Apply the same `max_tokens` cap to `app/api/release-notes/refine/route.ts`.

## 3. Validate locally

- [x] 3.1 Reproduce the worst case (2 large tickets: NOST-422 + P2-3010, detailed, 4 media, the user's general_context) against `localhost:3000`.
- [x] 3.2 Confirm HTTP 200 and total wall-clock ≤ ~25s; tighten caps if over.
- [x] 3.3 Confirm the generated note is coherent and not truncated mid-sentence.
- [x] 3.4 Sanity-check `standard` and `brief` types still generate.

## 4. Wrap up

- [x] 4.1 Do NOT commit until local validation passes.
- [x] 4.2 Report results; decide on commit/deploy with the user.
