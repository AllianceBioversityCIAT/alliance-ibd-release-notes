## ADDED Requirements

### Requirement: Media URLs passed as short placeholders

The `generate` and `refine` endpoints SHALL represent each media item to the model as a short placeholder token `[[IMG_n]]` (1-indexed) rather than its full pre-signed URL, and SHALL instruct the model to use that exact token as the markdown image URL.

#### Scenario: Note with several images

- **WHEN** a note is generated with N media items
- **THEN** the prompt lists each as `Image n: [[IMG_n]]`
- **AND** the model is instructed to write `![...]([[IMG_n]])`
- **AND** no full S3 URL is sent to the model

### Requirement: Client resolves placeholders to real URLs

The client streaming functions SHALL replace every `[[IMG_n]]` token in the streamed output with the corresponding `media[n-1]` URL, including tokens that span chunk boundaries, before the text is rendered or saved.

#### Scenario: Placeholder split across stream chunks

- **WHEN** a `[[IMG_n]]` token is split across two SSE chunks
- **THEN** the client buffers the partial token and resolves it once complete
- **AND** no raw `[[IMG_n]]` token appears in the final rendered note

#### Scenario: Unknown placeholder index

- **WHEN** the model emits `[[IMG_n]]` with no matching media item
- **THEN** the client leaves the token unchanged and does not error
