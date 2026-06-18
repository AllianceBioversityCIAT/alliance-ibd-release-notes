## Why

The Refine Release Note step lets users attach images, and the UI explicitly allows sending with only an image and no text (`flow-nodes.tsx` returns early only when both text and files are empty). But the `/api/release-notes/refine` endpoint rejects any request without a non-empty `instruction`, returning HTTP 400. The result: attaching an image to refine without typing anything always fails — a front/back contradiction users hit in production.

## What Changes

- When the user sends a refine request with images attached but no typed instruction, the request must succeed and the AI must place the image(s) in the release note.
- A sensible default instruction is supplied for the image-only case so the existing refine prompt (which already handles ambiguous image placement) can act on it.
- No change to the behavior when a text instruction IS provided.

## Capabilities

### New Capabilities
- `release-note-refine`: Post-generation editing of a release note via natural-language instructions and/or attached images, including the image-only case.

### Modified Capabilities
<!-- None — no existing specs in openspec/specs/ yet. -->

## Impact

- Front: `app/components/flow-nodes.tsx` (RefineChatNode send handler) and/or `app/components/flow-view.tsx` (refine handler) — supply a default instruction when only images are attached.
- Back: `app/api/release-notes/refine/route.ts` — relax the 400 validation so a request with media but no instruction is accepted.
- No AWS/infra change. Does not touch the separate `/generate` 500 issue.
