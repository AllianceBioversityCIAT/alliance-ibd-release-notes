## ADDED Requirements

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
