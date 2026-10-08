## ADDED Requirements

### Requirement: Refine accepts image-only requests

The Refine Release Note feature SHALL accept a refine request that includes one or more attached images even when the user provides no typed instruction, and SHALL integrate the image(s) into the release note. The system SHALL NOT return an error solely because the typed instruction is empty when media is present.

#### Scenario: Image attached without typed instruction

- **WHEN** the user attaches at least one image in the Refine node and sends without typing any instruction text
- **THEN** the request is accepted (no 400 error)
- **AND** the AI inserts the attached image(s) into the release note at a contextually sensible location

#### Scenario: Typed instruction with no images

- **WHEN** the user types an instruction and attaches no images
- **THEN** the request is accepted and the instruction is applied as before

#### Scenario: Empty request

- **WHEN** the user sends with neither typed instruction nor any attached image
- **THEN** the request is rejected (no call is made / 400) because there is nothing to act on

### Requirement: Default instruction for image-only refine

When a refine request has media but an empty instruction, the system SHALL supply a default instruction directing the AI to place the attached image(s) where they best fit given the existing release note and Jira context.

#### Scenario: Default instruction is supplied

- **WHEN** a refine request arrives with media and an empty instruction
- **THEN** a non-empty default instruction is used so the existing refine prompt can place the images
