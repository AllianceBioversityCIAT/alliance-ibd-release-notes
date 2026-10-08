# release-note-generation

## Purpose

Generating and refining a release note from Jira context and media via OpenAI, within the hosting platform's request-time budget (Amplify SSR Lambda buffers the response and times out at 30s).

## Requirements

### Requirement: Bounded generation time

The release-note generation endpoint SHALL produce its full OpenAI completion within the hosting platform's request-time budget (Amplify SSR Lambda: 30 seconds). The endpoint SHALL impose an explicit `max_tokens` cap on the OpenAI request so that no single generation can run unbounded.

#### Scenario: Detailed note over large multi-ticket context

- **WHEN** a "detailed" release note is requested for two large Jira tickets
- **THEN** the OpenAI completion finishes within the budget (target ≤ ~25s wall-clock)
- **AND** the endpoint returns the streamed note with HTTP 200, not a timeout 500

#### Scenario: Output length scales by note type

- **WHEN** a note is requested with type `detailed`, `standard`, or `brief`
- **THEN** the `max_tokens` cap is applied per type (detailed > standard > brief)
- **AND** the prompt's requested length is aligned with the cap so output is not truncated mid-sentence

### Requirement: Visible failure instead of silent 500

When the OpenAI upstream is slow, errors, or returns no body, the endpoint SHALL return a response whose body carries a human-readable error message rather than an empty 500.

#### Scenario: Upstream OpenAI error

- **WHEN** the OpenAI request fails or returns a non-OK status
- **THEN** the endpoint returns the upstream status with a JSON `{ error }` body describing the failure

### Requirement: Refine endpoint shares the same bounds

The `/api/release-notes/refine` endpoint SHALL apply the same `max_tokens` cap and time-budget guarantees as `generate`.

#### Scenario: Refine a long note

- **WHEN** a refine request is made against a long existing note
- **THEN** the refine completion is bounded by `max_tokens` and finishes within the budget

### Requirement: Media URLs passed as short placeholders

The `generate` and `refine` endpoints SHALL represent each media item to the model as a short placeholder token `[[IMG_n]]` (1-indexed) rather than its full pre-signed URL, instruct the model to use that token as the markdown image URL, and require every image to be placed inline early (not in a trailing section) so images survive content truncation.

#### Scenario: Note with several images

- **WHEN** a note is generated with N media items
- **THEN** the prompt lists each as a `[[IMG_n]]` token
- **AND** no full S3 URL is sent to the model
- **AND** each image is placed inline in its relevant section

### Requirement: Client resolves placeholders to real URLs

The client streaming functions SHALL replace every `[[IMG_n]]` token in the streamed output with the corresponding `media[n-1]` URL, including tokens that span chunk boundaries and the malformed `![[IMG_n]]` shape, before the text is rendered or saved.

#### Scenario: Placeholder split across stream chunks

- **WHEN** a `[[IMG_n]]` token is split across two SSE chunks
- **THEN** the client buffers the partial token and resolves it once complete
- **AND** no raw `[[IMG_n]]` token appears in the final rendered note

#### Scenario: Unknown placeholder index

- **WHEN** the model emits `[[IMG_n]]` with no matching media item
- **THEN** the client leaves the token unchanged and does not error
