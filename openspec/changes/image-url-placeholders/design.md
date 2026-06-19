## Context

The generate/refine prompts currently embed full pre-signed S3 URLs in the media section. The model copies them into the markdown, but each URL is ~600 chars (~200 tokens). With several images the model exhausts `max_tokens` while writing the URLs at the end of the note, truncating the image markdown. The client (`streamReleaseNote`/`streamRefineNote`) already parses each SSE chunk and yields `delta.content`, and it already holds the real `media[].url` values it sent — so it is the natural place to resolve placeholders.

## Goals / Non-Goals

**Goals:**
- Images render reliably regardless of note length.
- Free the URL tokens so they don't compete with content.
- Keep streaming UX (no flash of raw `[[IMG_n]]` in the final rendered note).

**Non-Goals:**
- Making S3 objects public / changing URL signing.
- Server-side stream rewriting (kept simple: resolve on the client).

## Decisions

- **Placeholder format `[[IMG_n]]`** (1-indexed, matching `Image n` in the prompt). Chosen because it is short (~5 tokens), unlikely to occur in real text, and easy to regex.
- **Prompt change:** the media section lists `Image n: [[IMG_n]]` and the system/media instructions tell the model to use the exact token `[[IMG_n]]` as the markdown image URL: `![description]([[IMG_1]])`.
- **Client-side resolution with boundary buffering:** in the async generator, keep a small `tail` buffer. On each chunk, prepend `tail`, replace all complete `[[IMG_n]]` tokens with `media[n-1].url`, then if the buffer ends with a string that could be the start of a placeholder (a prefix of `[[IMG_`…`]]`), hold it back in `tail` and yield the rest. Flush `tail` at stream end. This prevents a placeholder split across two chunks from leaking unresolved.
- **Unknown index fallback:** if `media[n-1]` is missing, leave the token as-is (no crash).

## Risks / Trade-offs

- **Boundary regex must be correct** or a split placeholder could render raw. Mitigated by a conservative "possible partial placeholder" suffix check and a unit-style local test across chunked input.
- **Model may not follow the token instruction perfectly.** Mitigated by clear, explicit instruction and by the fallback (a stray real URL still works; a stray token is rare and visible in testing).
