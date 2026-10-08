## Context

The Refine node (`RefineChatNode` in `app/components/flow-nodes.tsx`) lets the user type an instruction and/or attach images, then calls `onRefine(text, files)`. Its send guard only blocks when BOTH are empty:

```js
if (!text && files.length === 0) return;   // image-only IS allowed to send
onRefine(text, files);                       // sends text="" when only images
```

The handler in `app/components/flow-view.tsx` uploads the files to S3 and calls `streamRefineNote({ markdown, instruction, media })`. The endpoint `app/api/release-notes/refine/route.ts` then rejects empty instruction:

```js
if (!markdown || !instruction) return 400;
```

So image-only refine reaches the backend with `instruction: ""` and always 400s. The endpoint's system prompt already knows how to place images with ambiguous instructions, so the only thing missing is a non-empty instruction to act on.

## Goals / Non-Goals

**Goals:**
- Image-only refine works end to end (no 400).
- Behavior with a typed instruction is unchanged.
- No AWS/infra changes.

**Non-Goals:**
- The separate `/generate` 500 issue (infra/Lambda) — out of scope.
- Redesigning the refine UX or prompt.

## Decisions

**Decision: Supply a default instruction on the front when only images are attached.**

When `text` is empty but files exist, the front sends a default instruction such as: *"Integrate the attached image(s) into the release note where they fit best based on the existing content and Jira context."*

Rationale (why front over back):
- The backend keeps a clear, honest contract (an instruction is always required) — the front owns the UX intent.
- Single, readable change at the point where intent is known.
- The existing refine system prompt already handles image placement, so the default instruction is all that's needed.

Alternative considered: relax the backend validation to accept empty instruction when `media` is present, and have the backend inject the default. Rejected as the primary path because the front is where the "image-only means: place it" intent lives; however, as defense-in-depth the backend MAY also treat "media present + empty instruction" as valid (so a direct API call doesn't 400). We adopt the front default as the fix and optionally harden the backend guard to `if (!markdown || (!instruction && !(media?.length)))`.

## Risks / Trade-offs

- [Default instruction is generic] → The refine prompt already places ambiguous images contextually; acceptable. User can always type a precise instruction.
- [Two layers changed] → Keep the backend hardening minimal and covered by the spec scenarios.

## Migration Plan

No migration. Pure code change; deploys with the normal Amplify build. Rollback = revert the change.
