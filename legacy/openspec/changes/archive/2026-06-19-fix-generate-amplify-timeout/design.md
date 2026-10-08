## Context

`/api/release-notes/generate` streams OpenAI's SSE response straight back to the client via `new Response(openaiRes.body)`. Locally this streams progressively (TTFB ~7s). In production on Amplify WEB_COMPUTE the SSR Lambda buffers the whole response (measured TTFB == total) and is terminated at exactly 30s, returning a 500 with an empty body. Generation time scales with output length: a "detailed" note over two large Jira tickets produced ~2900 content chunks in ~61s locally — roughly 2× the Amplify budget. `/refine` uses the same streaming shape and carries the same risk.

## Goals / Non-Goals

**Goals:**
- Make `generate` and `refine` reliably finish within Amplify's ~30s Lambda budget (target ≤ ~25s total).
- Keep output useful and well-structured; "detailed" stays the most thorough tier, just bounded.
- Fail loud (clear error) rather than a silent 500 when upstream is slow or errors.

**Non-Goals:**
- Changing the hosting platform or enabling true Lambda response streaming (infra-owned by Cris; out of scope here).
- Async/job-queue generation.
- Touching Jira/GitHub/Notion/S3 flows.

## Decisions

- **Cap output with `max_tokens`.** Add `max_tokens` to the OpenAI request. Local measurement: ~47 tokens/s end-to-end. To stay under ~25s the completion must be roughly ≤ 1100–1200 tokens. Use a per-type cap: `detailed` ≈ 1800, `standard` ≈ 1200, `brief` ≈ 600 — then validate actual wall-clock locally and tighten until the worst realistic case (2 large tickets + detailed) finishes under ~25s. The cap is the hard guarantee; prompt wording is secondary.
- **Right-size the "detailed" instruction.** Drop the "AT LEAST 2000+ words / do NOT condense" demand that drives 60s runs; instead ask for a thorough but concise note that covers each change. This aligns the model's natural length with the token cap so output isn't cut off mid-sentence.
- **Keep the SSE passthrough.** No reason to remove streaming — it helps local dev and any future streaming host, and Amplify simply buffers it. The fix is purely about total completion time.
- **Apply the same caps to `/refine`.**

## Risks / Trade-offs

- **Shorter "detailed" notes.** Trade-off accepted: a note that reliably renders beats a longer one that 500s. Caps are tunable later if infra raises the timeout.
- **Token cap could truncate output.** Mitigated by lowering the prompt's length target so the model finishes naturally before hitting the cap.
- **Very large Jira context still costs input-processing time.** Input tokens add latency before the first output token; the cap bounds output but not input. If a worst case still flirts with 30s, the follow-up lever (out of scope) is raising the Amplify/CloudFront timeout with Cris.
