## 1. Front: default instruction for image-only refine

- [x] 1.1 In `app/components/flow-nodes.tsx` `RefineChatNode.handleSend`, when `text` is empty and `files.length > 0`, pass a non-empty default instruction to `onRefine` (e.g. "Integrate the attached image(s) into the release note where they fit best based on the existing content and Jira context."). Keep the chat-history label as "(images attached)".
- [x] 1.2 Verify the typed-instruction path is unchanged (non-empty text still sent verbatim).

## 2. Back: harden refine validation (defense-in-depth)

- [x] 2.1 In `app/api/release-notes/refine/route.ts`, change the guard so a request with media but empty instruction is accepted: reject only when `!markdown || (!instruction && !(media?.length))`.
- [x] 2.2 When `instruction` is empty but media is present, use the same default instruction text server-side before building the prompt.

## 3. Verify locally

- [x] 3.1 Run `npx tsc --noEmit` — no type errors.
- [ ] 3.2 Manually exercise: generate a note, then in Refine attach an image with NO text → request succeeds and image appears in the note.
- [ ] 3.3 Confirm: Refine with text + no image still works; empty send (no text, no image) does nothing.
