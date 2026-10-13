# Decision Records

> **Project:** Jembatan Komunikasi Dua Arah untuk Tuli di Layanan Publik
> **Scope:** General Product + Backend + Modeling Integration
> **Status:** Consolidated Decision Reference
> **Last Updated:** 2026-09-28
>
> This document is append-only.
>
> Existing ADRs must not be overwritten or silently rewritten.
> When a new decision changes an existing decision, create a new ADR that explicitly supersedes the affected ADR.
>
> ## Source-of-Truth Priority
>
> When sources conflict, use this priority:
>
> 1. Explicit approved user/team decision
> 2. Approved ADR in this file
> 3. General PRD
> 4. Backend PRD
> 5. Technical documentation
> 6. Existing implementation
> 7. Assumptions
>
> If a conflict cannot be resolved from these sources, implementation MUST stop and the conflict MUST be reported.

---

# ADR-001 — Product Scope and Two-Way Communication Model

**Status:** Accepted

The project is a two-way communication aid for Deaf users and staff in public-service environments, with the MVP focused on a Puskesmas scenario.

The system uses a single institutional kiosk device.

The MVP does NOT use:

* multi-device sessions
* room codes
* QR pairing
* daily user login for kiosk users

The two communication directions are:

### Flow A — Sign → Text/Speech

```text
Deaf user
    ↓
Camera
    ↓
Auto-capture
    ↓
MediaPipe landmarks
    ↓
Modeling
    ↓
Backend
    ↓
Phrase result
    ↓
Text / TTS
```

### Flow B — Speech/Text → Sign

```text
Staff
    ↓
Speech-to-text / text input
    ↓
Backend matching
    ↓
Phrase
    ↓
Approved sign reference
    ↓
BISINDO video
```

The project MUST NOT be described as a general-purpose BISINDO translator.

The defensible product description is:

> AI membantu mengenali sejumlah frasa/kata BISINDO yang telah divalidasi untuk skenario layanan Puskesmas.

The system is a constrained vocabulary communication aid, not unrestricted natural-language BISINDO translation.

---

# ADR-002 — Kiosk Architecture

**Status:** Accepted

The MVP architecture is:

```text
Frontend Kiosk
       ↓
Backend API
       ↓
Modeling
       ↓
Backend
       ↓
Frontend
```

Backend is responsible for:

* REST API
* orchestration
* validation
* Modeling integration
* business decision enforcement
* phrase lookup
* approved video lookup
* database
* logging
* admin operations

Modeling is responsible for:

* ML preprocessing
* feature processing
* inference
* model confidence
* model-specific matching behavior

Frontend is responsible for:

* camera capture
* auto-capture state machine
* UI
* TTS
* user confirmation interaction
* video playback
* sending final user actions to Backend

---

# ADR-003 — Auto-Capture Contract

**Status:** Accepted

Frontend auto-capture uses:

```text
IDLE
  ↓
HAND_DETECTED
  ↓
RECORDING
  ↓
PROCESSING
  ↓
RESULT
```

Capture starts after stable hand detection for approximately 250 ms.

Recording stops when:

* average landmark movement remains below the configured threshold for approximately 1–2 seconds, OR
* hand is absent for more than approximately 500 ms.

Limits:

* minimum sequence duration: approximately 0.5 s
* maximum sequence duration: 8 s

Frontend sends the resulting canonical sequence to Backend.

Backend does not own camera/capture state.

---

# ADR-004 — Canonical Modeling Input: Sequence

**Status:** Accepted

The legacy sign request:

```text
[{ t, landmarks }]
```

is superseded.

The canonical Modeling input is `Sequence`:

```json
{
  "frames": [
    {
      "t_ms": 367,
      "hands": [
        {
          "landmarks": [[x, y, z]],
          "handedness": "Right",
          "score": 0.973
        }
      ],
      "pose": [[x, y, z, visibility]]
    }
  ],
  "mirrored": false,
  "width": 960,
  "height": 540
}
```

Contract requirements:

* `t_ms` is required.
* timestamps are relative and monotonic.
* each frame contains 0–2 hands.
* frames without detected hands MUST use `hands: []`.
* hand landmarks are 21 × 3.
* pose follows the current Modeling schema.
* `mirrored` is required.
* `width` and `height` are required.
* MediaPipe normalized coordinates are expected.

Backend MUST:

* validate the structure
* enforce API limits
* forward the sequence

Backend MUST NOT:

* normalize landmarks
* transform coordinates
* perform ML preprocessing
* modify the sequence to compensate for Modeling

Preprocessing remains owned by Modeling.

---

# ADR-005 — Modeling Output Contract

**Status:** Accepted

The current Modeling artifact returns:

```json
{
  "phraseId": "label_05",
  "label": "Lagi",
  "confidence": 0.999,
  "action": "accept",
  "reason": null,
  "topK": [
    {
      "phraseId": "label_05",
      "label": "Lagi",
      "confidence": 0.999
    }
  ]
}
```

Backend supports the following fields:

```text
phraseId
label
confidence
action
reason
topK
```

Semantics:

### `phraseId`

Primary identifier used to map Modeling output to Backend domain data.

### `label`

Human-readable model label.

It is informational and MUST NOT replace `phraseId` as identity.

### `confidence`

Value from 0 to 1.

Backend uses this value for product/business decision enforcement.

### `action`

Modeling currently returns:

```text
accept
confirm
reject
```

This is advisory.

Backend remains the business-decision owner.

### `topK`

Optional metadata.

Backend MUST NOT use `topK` to override the primary prediction or confidence decision.

### `reason`

Metadata/debug/analytics.

Backend MUST NOT depend on a fixed enum because Modeling may add new reasons.

Current examples include:

```text
too_short
none_class
far_from_centroid
null
```

---

# ADR-006 — Backend Confidence Decision

**Status:** Accepted

Backend enforces:

```text
confidence >= 0.85
    → accepted

0.60 <= confidence < 0.85
    → pending_confirmation

confidence < 0.60
    → escalated_to_jbi
```

Important:

`confirmed` is NOT the inference result for confidence 0.60–0.84.

The intermediate state means:

> prediction requires user confirmation.

Final user action is separate:

```text
pending_confirmation
        ↓
   ┌────┴────┐
   ↓         ↓
confirm    retry/JBI
   ↓         ↓
confirmed  escalated_to_jbi
```

Backend MUST NOT automatically write `confirmed` merely because confidence is between 0.60 and 0.85.

---

# ADR-007 — Confidence Precision and Rounding

**Status:** Accepted

Modeling returns confidence rounded to 4 decimal places.

Backend uses the received confidence value for its business decision.

If rounding causes a discrepancy between Modeling's internal action and Backend's action, Backend's decision is authoritative.

Example:

```text
Modeling internal:
0.84996

Returned:
0.8500

Backend:
0.8500 >= 0.85
→ accepted
```

Backend MUST NOT attempt to recover raw/internal confidence unavailable through the contract.

---

# ADR-008 — Phrase Identity and Modeling Mapping

**Status:** Accepted

`phrases.id` remains the stable domain primary key and uses UUID.

Modeling identifiers such as:

```text
label_05
label_06
label_31
```

MUST NOT become database primary keys.

The `phrases` table contains:

```text
id                  UUID PK
model_phrase_id     TEXT UNIQUE NULL
phrase_text
category
language_variant
active
sign_recognizable
```

Mapping:

```text
Modeling phraseId
       ↓
phrases.model_phrase_id
       ↓
phrases.id
```

`model_phrase_id` is nullable because domain phrases may not have a corresponding Modeling class.

If Modeling returns an unknown `phraseId`:

* Backend MUST NOT guess.
* Backend MUST NOT create a phrase automatically.
* Backend MUST NOT use `label` as identity fallback.
* Backend MUST handle it through the approved error/escalation contract.

This keeps domain identity independent from the ML artifact.

---

# ADR-009 — Vocabulary

**Status:** Accepted

The database may contain the full 32-word vocabulary from the current dataset/reference set.

The current Modeling artifact recognizes 10 classes for sign-to-text:

```text
label_05  Lagi
label_06  Maaf
label_09  Saya
label_10  Terima kasih
label_11  Tuli
label_13  Siapa
label_15  Di mana
label_17  Bagaimana
label_24  Datang
label_31  Malam
```

These are represented as data:

```text
sign_recognizable = true
```

Other vocabulary entries:

```text
sign_recognizable = false
```

The list MUST NOT be hardcoded into Backend business logic.

This allows the Modeling artifact to change without requiring a Backend code rewrite.

`active` and `sign_recognizable` are independent concepts.

---

# ADR-010 — Sign Reference / Approved Video

**Status:** Accepted

`sign_references` remains part of the domain schema because the current PRD requires it.

It is used for Flow B:

```text
Text/Speech
    ↓
Phrase
    ↓
Approved sign reference
    ↓
Video
```

Modeling does NOT consume these videos during runtime inference.

The reference video is an approved output asset, not Modeling input.

Only approved references may be returned to the kiosk.

For MVP:

```text
one phrase
    ↓
one canonical approved video
```

Complex video ranking/tie-breaking is not required unless a future decision changes this.

---

# ADR-011 — Institutions and Devices

**Status:** Accepted

The domain contains:

```text
institutions
devices
```

`devices.id` uses UUID.

Each device belongs to an institution.

A kiosk request identifies its origin using `device_id`.

Backend validates:

```text
device exists
AND
device is active
```

The MVP does not introduce:

* room pairing
* QR pairing
* session codes
* daily kiosk login

---

# ADR-012 — Privacy and Data Retention

**Status:** Accepted

Raw patient data MUST NOT be stored by default.

Backend/Modeling MUST NOT persist:

* raw video
* raw audio
* raw landmark sequences

unless a separate approved decision explicitly enables such storage.

Runtime input is processed in memory and discarded after processing.

Reference signer videos require appropriate consent/approval.

Matching logs contain metadata/business outcomes, not raw biometric/video/audio input.

---

# ADR-013 — Modeling Integration Boundary

**Status:** Accepted

Backend uses a dedicated Modeling adapter/client.

Conceptual architecture:

```text
API Route
    ↓
Matching Service
    ↓
Modeling Client
    ↓
Modeling
```

The adapter may use:

1. Python library integration, if environment/dependencies are compatible.
2. Separate Modeling process/service, if library integration is not practical.

The logical contract MUST remain the same.

The API route MUST NOT depend directly on Modeling implementation internals.

For library integration, the `Predictor` instance should be initialized once and reused rather than loaded for every request.

The current Modeling package can be imported conceptually as:

```python
from bisindo.predict import Predictor
```

but Backend implementation must follow the actual repository/environment rather than assuming a package structure that does not exist.

---

# ADR-014 — Modeling Timeout

**Status:** Accepted

Backend → Modeling timeout budget:

```text
3 seconds
```

The overall frontend result budget is approximately:

```text
4 seconds
```

Backend MUST use an explicit timeout.

Timeout MUST NOT produce a fake prediction.

On timeout:

```text
no prediction
```

and Backend returns the appropriate error/escalation response according to the approved error contract.

---

# ADR-015 — Error Contract

**Status:** Accepted

At minimum, Backend distinguishes:

### Validation errors

Example:

```text
422
```

for malformed Sequence or invalid field structure.

### Payload too large

Example:

```text
413
```

for excessive frame count or configured payload limits.

### Modeling timeout

Appropriate timeout response according to the API error contract.

### Modeling unavailable

Appropriate upstream/service error.

### Unknown Modeling phrase

Must not be silently mapped to another phrase.

### Important rule

Errors MUST NOT be converted into fake predictions.

---

# ADR-016 — `/api/match/sign`

**Status:** Accepted

Purpose:

```text
Sign sequence → recognized phrase/action
```

Flow:

```text
Frontend
   ↓
POST /api/match/sign
   ↓
Backend validation
   ↓
Modeling
   ↓
Modeling result
   ↓
phraseId mapping
   ↓
confidence decision
   ↓
Backend response
   ↓
Frontend
```

Backend responsibilities:

1. validate Sequence
2. enforce request limits
3. call Modeling
4. enforce timeout
5. resolve `phraseId`
6. enforce confidence decision
7. return stable API response

Backend MUST NOT:

* implement ML matching itself
* recompute Modeling preprocessing
* force a phrase when Modeling rejects
* use `topK` to fabricate a result

---

# ADR-017 — `/api/match/text`

**Status:** Accepted

Purpose:

```text
Text/speech input → phrase → approved sign video
```

Flow:

```text
Speech/Text
    ↓
Backend text matching
    ↓
Phrase
    ↓
Approved sign reference
    ↓
video_url
```

Backend is responsible for:

* receiving normalized text/utterance
* matching it against the approved phrase vocabulary
* resolving the domain phrase
* retrieving the approved reference
* returning the approved video asset

The system is not required to perform unrestricted natural-language translation.

Text matching should operate against the approved phrase vocabulary and aliases.

---

# ADR-018 — `/api/logs`

**Status:** Deferred / P2

Detailed logging semantics are intentionally deferred to P2.

The final action vocabulary is:

```text
accepted
confirmed
escalated_to_jbi
```

The initial inference:

```text
pending_confirmation
```

does not automatically mean:

```text
confirmed
```

Final action is recorded after the relevant user action.

Raw video/audio/landmark data MUST NOT be stored.

---

# ADR-019 — Admin API

**Status:** Accepted

Admin operations require authentication.

Kiosk/public matching endpoints do not require end-user authentication in the MVP.

Admin endpoints:

```text
GET    /api/admin/phrases
POST   /api/admin/phrases
PATCH  /api/admin/phrases/{id}

POST   /api/admin/phrases/{id}/references

GET    /api/admin/logs
GET    /api/admin/devices
```

Admin responsibilities include:

* phrase CRUD
* approved reference management
* device management
* log inspection

Backend MUST NOT expose unrestricted administrative operations through public kiosk endpoints.

---

# ADR-020 — API Validation

**Status:** Accepted

Backend validates input even if Frontend already validates it.

This is defense-in-depth.

Validation includes:

* required fields
* data types
* UUID format
* frame count
* landmark shape
* pose shape
* dimensions
* allowed request limits
* device identity where applicable

Frontend validation MUST NOT be treated as sufficient for Backend trust.

---

# ADR-021 — API Stability

**Status:** Accepted

Existing API contracts are stable unless a new decision explicitly approves a breaking change.

Breaking changes require:

1. review
2. explicit decision
3. ADR
4. implementation
5. test update

Backend MUST NOT silently rename:

* endpoints
* request fields
* response fields
* database identities
* action values

---

# ADR-022 — Backend Statelessness

**Status:** Accepted

Backend remains stateless per request.

`device_id` identifies the kiosk origin.

Backend MUST NOT introduce unnecessary server-side session state for the MVP.

The temporary `pending_confirmation` state is a product flow state, not a requirement for persistent backend session state unless the approved implementation explicitly needs it.

---

# ADR-023 — Backend Implementation Order

**Status:** Accepted

Backend implementation follows vertical slices.

The implementation order is:

```text
Phase 1
Database foundation
    ↓
Migration
    ↓
Seed
    ↓
Phrase mapping
```

```text
Phase 2
Modeling integration
    ↓
Sequence validation
    ↓
Modeling adapter
    ↓
Timeout/error handling
```

```text
Phase 3
Sign matching vertical slice
    ↓
POST /api/match/sign
    ↓
confidence decision
    ↓
pending confirmation
```

```text
Phase 4
Final action logging
    ↓
POST /api/logs
```

```text
Phase 5
Text → Sign
    ↓
POST /api/match/text
    ↓
phrase lookup
    ↓
approved video
```

```text
Phase 6
Admin
    ↓
phrases
    ↓
references
    ↓
logs
    ↓
devices
```

```text
Phase 7
Integration
    ↓
Frontend
    ↓
end-to-end testing
```

Backend MUST NOT attempt to implement every endpoint simultaneously before the core sign-matching vertical slice is verified.

---

# ADR-024 — Backend Phase 1: Database Foundation

**Status:** Accepted

Phase 1 scope:

* inspect existing schema
* migration
* `model_phrase_id`
* `sign_recognizable`
* required tables
* indexes
* seed vocabulary
* database tests

Phase 1 MUST NOT include:

* frontend changes
* Modeling changes
* full `/api/match/sign`
* `/api/match/text`
* admin UI
* unrelated refactoring

If Phase 1 discovers a schema conflict, implementation stops and the conflict is reported.

---

# ADR-025 — Backend Phase 2: Modeling Adapter

**Status:** Accepted

Phase 2 scope:

* Modeling input schema
* Modeling output schema
* adapter/client
* phrase ID mapping
* timeout
* Modeling error mapping
* adapter tests

The adapter MUST preserve the separation:

```text
Modeling
    = inference

Backend
    = orchestration + product/business decision
```

Modeling's `action` MUST NOT replace Backend's confidence enforcement.

---

# ADR-026 — Backend Phase 3: Sign Matching

**Status:** Accepted

Phase 3 implements:

```text
POST /api/match/sign
```

Required flow:

```text
validate
   ↓
Modeling
   ↓
resolve phrase
   ↓
confidence decision
   ↓
response
```

Required boundary tests:

```text
0.00
0.5999
0.6000
0.8499
0.8500
1.00
```

Expected:

```text
0.00    → escalated_to_jbi
0.5999  → escalated_to_jbi
0.6000  → pending_confirmation
0.8499  → pending_confirmation
0.8500  → accepted
1.00    → accepted
```

---

# ADR-027 — Backend Phase 4: Confirmation and Final Action

**Status:** Accepted

Inference and final user action remain separate.

Example:

```text
confidence = 0.72
        ↓
pending_confirmation
        ↓
user clicks Confirm
        ↓
confirmed
```

or:

```text
confidence = 0.72
        ↓
pending_confirmation
        ↓
user clicks Retry/JBI
        ↓
escalated_to_jbi
```

Backend MUST NOT assume user confirmation.

The final action is produced by explicit user interaction.

---

# ADR-028 — Backend Phase 5: Text → Sign

**Status:** Accepted

Text/speech flow:

```text
input
 ↓
text matching
 ↓
domain phrase
 ↓
approved reference
 ↓
video_url
```

The Modeling sign recognizer is not used as a video retrieval mechanism.

Reference videos remain separate domain assets.

---

# ADR-029 — Backend Phase 6: Admin and Operations

**Status:** Accepted

After the core communication flows are verified, Backend implements:

* phrase administration
* reference administration
* log inspection
* device administration

Admin authentication is mandatory.

No unrelated admin features should be added to MVP.

---

# ADR-030 — Backend Phase 7: Integration and Final Verification

**Status:** Accepted

Before Backend is considered complete:

### API

Verify:

* `/api/match/sign`
* `/api/match/text`
* `/api/logs`
* `/api/phrases`
* admin endpoints

### Modeling

Verify:

* canonical Sequence
* response contract
* mapping
* timeout
* rejection behavior

### Confidence

Verify:

```text
>= 0.85
0.60–<0.85
< 0.60
```

### Database

Verify:

* UUID domain IDs
* Modeling mapping
* vocabulary
* references
* device relation
* indexes

### Privacy

Verify:

* no raw video logs
* no raw audio logs
* no raw landmark logs

### Integration

Verify:

```text
Kiosk
 ↓
Backend
 ↓
Modeling
 ↓
Backend
 ↓
Kiosk
```

and:

```text
Staff
 ↓
Backend
 ↓
Phrase
 ↓
Approved video
 ↓
Kiosk
```

---

# ADR-031 — Testing Strategy

**Status:** Accepted

Backend testing must include:

### Unit tests

* schema validation
* confidence decision
* phrase mapping
* Modeling adapter
* error mapping

### Integration tests

* Backend ↔ database
* Backend ↔ Modeling
* phrase/reference lookup

### Boundary tests

```text
0.5999
0.6000
0.8499
0.8500
```

### Failure tests

* malformed request
* too many frames
* Modeling timeout
* Modeling unavailable
* unknown phrase ID
* no prediction
* missing topK
* unknown reason

### End-to-end

At least one complete sign-to-result flow and one text-to-video flow must be verified before final integration.

---

# ADR-032 — No Silent Scope Expansion

**Status:** Accepted

Backend implementation MUST follow the smallest correct change principle.

Do not introduce without explicit approval:

* new architecture
* new framework
* new database
* new authentication model
* new API endpoint
* changed confidence thresholds
* changed request/response contract
* changed privacy behavior
* additional external service
* unrelated refactoring

If implementation requires one of these, STOP and request/record a decision.

---

# ADR-033 — Current Modeling Artifact Status

**Status:** Accepted / Artifact-Dependent

The current artifact:

```text
20260928-1331
```

is the current implementation reference.

The current recognized sign vocabulary contains 10 classes:

```text
Lagi
Maaf
Saya
Terima kasih
Tuli
Siapa
Di mana
Bagaimana
Datang
Malam
```

This is a statement about the current artifact, not a permanent product promise.

If a future artifact changes:

* recognizable labels
* phrase IDs
* response schema
* confidence behavior
* preprocessing requirements

the Backend integration MUST be reviewed before silently adopting the change.

A new artifact does not automatically authorize a breaking Backend change.

---

# ADR-034 — Backend Definition of Done

**Status:** Accepted

Backend MVP is considered complete only when:

### Foundation

* [ ] database schema implemented
* [ ] migrations pass
* [ ] vocabulary seeded
* [ ] Modeling mapping exists
* [ ] device/institution relations work

### Modeling

* [ ] canonical Sequence accepted
* [ ] Modeling adapter works
* [ ] response contract validated
* [ ] phrase mapping works
* [ ] timeout enforced
* [ ] errors handled

### Sign → Text

* [ ] `/api/match/sign` works
* [ ] confidence thresholds enforced
* [ ] pending confirmation supported
* [ ] no fake prediction on rejection
* [ ] final action can be logged

### Text → Sign

* [ ] `/api/match/text` works
* [ ] approved phrase resolved
* [ ] approved video resolved
* [ ] unapproved references never returned

### Logging

* [ ] final user actions recorded
* [ ] no raw video
* [ ] no raw audio
* [ ] no raw landmarks

### Admin

* [ ] phrase CRUD
* [ ] reference management
* [ ] log inspection
* [ ] device inspection
* [ ] admin authentication

### Testing

* [ ] unit tests pass
* [ ] integration tests pass
* [ ] boundary confidence tests pass
* [ ] timeout tests pass
* [ ] validation tests pass
* [ ] end-to-end flow passes

### Governance

* [ ] no unresolved ADR conflict
* [ ] no silent schema change
* [ ] no silent API change
* [ ] no unrelated architecture change
* [ ] final read-only audit completed

---

# ADR-035 — Stop Conditions

**Status:** Accepted

Backend agent/developer MUST STOP instead of guessing when:

1. an ADR conflicts with the requested implementation
2. PRD and approved ADR conflict without a resolution
3. Modeling contract changes unexpectedly
4. database schema requires a new architectural decision
5. privacy behavior needs to change
6. API breaking change is required
7. confidence thresholds need to change
8. user confirmation semantics are unclear
9. Modeling returns an identifier that cannot be mapped safely
10. implementation requires an unapproved dependency
11. scope cannot be determined from approved documents

When stopping, report:

```text
Conflict:
Evidence:
Affected decision:
Why implementation cannot safely continue:
Proposed decision needed:
```

Do not silently resolve the conflict through code.

---

# ADR-036 — Final Backend Responsibility Boundary

**Status:** Accepted

Backend owns:

```text
API
Validation
Orchestration
Modeling adapter
Timeout
Error mapping
Phrase mapping
Business decision
Database
Approved references
Logging
Admin operations
```

Modeling owns:

```text
Preprocessing
Feature processing
Inference
Model-specific matching
Model confidence generation
```

Frontend owns:

```text
Camera
Auto-capture
UI
TTS
Video playback
User confirmation interaction
```

The boundary is:

```text
Frontend
    ↓
Backend
    ↓
Modeling
    ↓
Backend
    ↓
Frontend
```

No component should silently take ownership of another component's core responsibility.

---

# Final Backend Execution Plan

The approved implementation sequence is:

```text
1. Read AGENTS.md
        ↓
2. Read decisions.md
        ↓
3. Audit PRD + current repository
        ↓
4. Check for conflicts
        ↓
5. Database migration
        ↓
6. Vocabulary seed
        ↓
7. Modeling adapter
        ↓
8. Modeling contract tests
        ↓
9. POST /api/match/sign
        ↓
10. Confidence + pending confirmation
        ↓
11. /api/logs
        ↓
12. POST /api/match/text
        ↓
13. Approved video lookup
        ↓
14. Admin endpoints
        ↓
15. Frontend integration
        ↓
16. Integration testing
        ↓
17. Final read-only audit
```

At every phase:

```text
Understand
    ↓
Plan
    ↓
Check conflicts
    ↓
Implement
    ↓
Test
    ↓
Review
    ↓
Report
```

If a stop condition occurs, implementation stops and a new decision is created before continuing.

---

# ADR-037 — HTTP Contract for `POST /api/match/sign`

**Status:** Accepted (approved by the project owner, 2026-09-29)

**Relates to:** ADR-004, ADR-005, ADR-006, ADR-007, ADR-008, ADR-011, ADR-014, ADR-015, ADR-016, ADR-020, ADR-021.
This ADR does not supersede any earlier ADR. It fixes the HTTP statuses and envelope that ADR-015 left to "the API error contract", and the device statuses that ADR-011 left open.

## Request

```json
{
  "device_id": "uuid",
  "sequence": { "frames": [], "mirrored": false, "width": 1280, "height": 720 },
  "duration_ms": 1200
}
```

* `device_id` — required, UUID.
* `sequence` — required, canonical `Sequence` (ADR-004): every frame has `t_ms`, `hands` (0–2; `[]` when no hand), and a `pose` key whose value is `null` or 33 × 3 / 33 × 4; `t_ms` monotonic; `mirrored` boolean; `width`/`height` integers > 0.
* `duration_ms` — required integer, `>= 500` (PRD-BE §4.1). No upper bound. Not part of `sequence`.

## Response 200

```json
{ "phrase_id": "uuid | null", "phrase_text": "string | null", "confidence": 0.9123, "action": "accepted" }
```

* `action` is one of `accepted`, `pending_confirmation`, `escalated_to_jbi` (ADR-006).
* `accepted` / `pending_confirmation`: `phrase_id` = `phrases.id`, `phrase_text` = `phrases.phrase_text` from the database.
* `escalated_to_jbi`: `phrase_id = null`, `phrase_text = null`.
* `confirmed` is never returned by this endpoint (ADR-006, ADR-027).
* `confidence` is the value returned by Modeling, unchanged (ADR-007).

## Error envelope

Every error response of this endpoint, including validation errors:

```json
{ "error": { "code": "STABLE_CODE", "message": "human-readable, no patient data" } }
```

No retry metadata in the body. Messages never echo request values.

## Error mapping

| Condition | HTTP | Code |
|---|---:|---|
| Invalid body / invalid UUID / `duration_ms < 500` | 422 | `VALIDATION_ERROR` |
| Device not found | 404 | `DEVICE_NOT_FOUND` |
| Device found, `active = false` | 403 | `DEVICE_INACTIVE` |
| Frames > `Predictor.max_frames` | 413 | `PAYLOAD_TOO_LARGE` |
| Modeling timeout (3 s, ADR-014) | 504 | `MODELING_TIMEOUT` |
| Modeling / Predictor unavailable | 503 | `MODELING_UNAVAILABLE` |
| Unknown `phraseId`, or phrase with `sign_recognizable != true` | 500 | `MODEL_MAPPING_ERROR` |
| Contract violation / unexpected error / database error | 500 | `INTERNAL_ERROR` |

Devices are never created from a request.

## Phrase policy (approved Phase 3 decision, recorded here)

For a non-reject Modeling result with confidence >= 0.60, the phrase is resolved only by `phrases.model_phrase_id`:

* not found → `MODEL_MAPPING_ERROR`
* `sign_recognizable` not true → `MODEL_MAPPING_ERROR`
* recognizable, `active` not true → `escalated_to_jbi`, no phrase
* recognizable and active → ADR-006 confidence decision

Modeling `reject` → `escalated_to_jbi` without phrase lookup. No nearest-phrase or `topK` fallback.

## Processing order

1. Request validation
2. Device lookup + active check
3. Frame-limit check
4. Modeling
5. Phrase lookup / business decision
6. Response

The sequence is not sent to Modeling before steps 1–3 pass.

---

# ADR-038 — Phase 4: Final Action Logging and `POST /api/logs`

**Status:** Accepted (approved by the project owner, 2026-09-29)

**Supersedes:** the *Deferred* status of ADR-018 for the logging scope defined here.
**Clarifies (does not replace):** ADR-027, ADR-037.
**Relates to:** ADR-006, ADR-007, ADR-011, ADR-012, ADR-015, ADR-021, ADR-022, ADR-023.

## 1. Context

ADR-023 and ADR-027 schedule Phase 4 as final action logging via `POST /api/logs`, while ADR-018 deferred the detailed logging semantics. The Phase 4 preflight found that the semantics, the writer of each `matching_logs` row, the confidence precision, the validation boundary, the error contract, duplicate handling and the Retry behavior were undecided. This ADR records the owner decisions for those points.

For Phase 4, "Phase 4" means Final Action Logging / `POST /api/logs`, as numbered in ADR-023 and ADR-027. The different numbering in AGENTS §39 is a documentation alignment finding and is not changed by this ADR.

## 2. Decision

Logging is split between two writers:

* `POST /api/match/sign` persists final **inference** outcomes: `accepted` and `escalated_to_jbi`.
* `POST /api/logs` persists final **user** actions: `confirmed` and `escalated_to_jbi`.

`pending_confirmation` is never persisted. No server-side state is introduced (ADR-022).

`matching_logs` is an **event log**, not a unique-case counter. One user interaction may produce more than one row.

## 3. `POST /api/logs` contract

Public kiosk endpoint (no authentication, as in PRD-BE §3 and AGENTS §23). It records a **client-reported event**. It performs no threshold decision, no inference, no nearest-phrase lookup, no confidence classification and no reconstruction of a Modeling result.

Request:

```json
{
  "device_id": "uuid",
  "direction": "sign_to_text",
  "predicted_phrase_id": "uuid | null",
  "confidence": 0.72,
  "resulted_action": "confirmed | escalated_to_jbi"
}
```

* `device_id` — required UUID; device must exist and be active.
* `direction` — required; only `sign_to_text` is accepted in Phase 4. `speech_to_sign` → `422 VALIDATION_ERROR` (the Text → Sign flow is Phase 5).
* `resulted_action` — required; only `confirmed` or `escalated_to_jbi`. `accepted` and `pending_confirmation` → `422 VALIDATION_ERROR`.
* `predicted_phrase_id` — UUID or `null`:
  * `confirmed` → required (non-null);
  * `escalated_to_jbi` → may be `null`.
* `predicted_phrase_id`, when present, must reference an existing `phrases.id` (FK-valid). `active` and `sign_recognizable` are **not** required for event logs.
* `confidence` — required number in `0..1` (the column is `NOT NULL`).
* `created_at` — generated by the database; not accepted from the client.

Success: `204 No Content`, no body.

## 4. Error contract for `POST /api/logs`

Envelope identical to ADR-037: `{"error": {"code": "...", "message": "..."}}`. Messages never echo request values.

| Condition | HTTP | Code |
|---|---:|---|
| Invalid body / type / UUID / enum / range / rule in §3 | 422 | `VALIDATION_ERROR` |
| Device not found | 404 | `DEVICE_NOT_FOUND` |
| Device inactive | 403 | `DEVICE_INACTIVE` |
| `predicted_phrase_id` not found | 404 | `PHRASE_NOT_FOUND` |
| Unexpected internal / database error | 500 | `INTERNAL_ERROR` |

No other error codes are introduced. The fail-open rule in §6 does **not** apply to this endpoint.

## 5. `POST /api/match/sign` logging behavior

The processing order of ADR-037 gains one step:

1. Request validation
2. Device lookup + active check
3. Frame-limit check
4. Modeling
5. Phrase lookup / business decision
6. **Best-effort persistence of the final inference event**
7. Response

* A row is written only when the decision is `accepted` or `escalated_to_jbi`, with `direction = sign_to_text`, the authoritative returned confidence (ADR-007) and the decided action.
* `pending_confirmation` → no row.
* Requests that end in an error (422, 404, 403, 413, 503, 504, 500) produce no row: errors are not match results (AGENTS §14).
* The response contract of ADR-037 is unchanged. `confirmed` is never a match response.

## 6. Fail-open

If the internal insert of step 6 fails, the matching result is still returned with the normal ADR-037 response. The failure does not become `500 INTERNAL_ERROR` and does not change the business decision. Matching logs are **best-effort observability**.

The ADR-037 mapping "database error → 500 INTERNAL_ERROR" remains in force for every other database operation of `/api/match/sign` (device lookup, phrase lookup).

## 7. Pending, JBI and Retry

* A `pending_confirmation` left without confirm or escalation → no row.
* Confirm from pending → `/api/logs` with `confirmed`.
* JBI from pending → `/api/logs` with `escalated_to_jbi`.
* **Retry from pending → `/api/logs` with `escalated_to_jbi`** (ADR-027, unchanged).
* Every JBI click is a new event and may produce a new row, including after an `accepted` or an inference `escalated_to_jbi` outcome. No deduplication by phrase, confidence, timestamp, device or any combination; no server-side correlation with earlier inferences.

## 8. Confidence precision

`matching_logs.confidence` changes from `numeric(4,3)` to `numeric(5,4)` through a **new** migration in the implementation phase, so that 4-decimal authoritative values (ADR-007), e.g. `0.8499` and `0.5999`, are stored without loss. The Phase 1 migration is not modified. The Phase 1 verification script may be updated to match the new schema. No other schema change is part of Phase 4.

## 9. Duplicate semantics

Duplicate events are accepted for the MVP. There is no idempotency key, unique constraint, deduplication heuristic or exactly-once guarantee. The MVP guarantees event persistence without intentional data corruption, not exactly-once delivery. This is how PRD-BE §9 ("tetap konsisten meski dipanggil dua kali") is interpreted for Phase 4.

## 10. Privacy

Rows contain only `device_id`, `direction`, `predicted_phrase_id`, `confidence`, `resulted_action`, `created_at` (ADR-012, AGENTS §26). No raw video, audio, landmarks, sequence or request body is stored or logged.

## 11. Scope

* **Backend:** `POST /api/logs`; the step-6 insert in `/api/match/sign`; phrase existence lookup; `PHRASE_NOT_FOUND`.
* **Database:** one new migration for §8 only.
* **Frontend:** exactly one behavioral logging change — Retry from `pending_confirmation` sends `/api/logs` with `direction = sign_to_text`, `resulted_action = escalated_to_jbi`, the current phrase id and the current match confidence, before the existing retry runs. No UI, visual, sequence-format, `MatchAction`, device-configuration or speech-to-sign change.
* **Modeling:** no change.

Out of scope (unchanged/deferred): retention, authentication/authorization, rate limiting, admin logging, `/api/match/text`, speech-to-sign, Storage, CORS, connection pooling, model artifact/version API, exactly-once, analytics schema, manual evaluation fields, and the Phase 3 FE integration findings (legacy sequence format, missing `pending_confirmation` in FE, FE confirmation UI keyed on `confirmed`, non-UUID default `VITE_DEVICE_ID`).

## 12. Relationship to earlier ADRs

* **ADR-018** — its *Deferred / P2* status is superseded by this ADR for the Phase 4 logging scope. Its final action vocabulary (`accepted`, `confirmed`, `escalated_to_jbi`), the rule that `pending_confirmation` is not `confirmed`, and its privacy rule remain valid. Its sentence "Final action is recorded after the relevant user action" applies to the user-action path; inference outcomes are recorded by `/api/match/sign` (§5).
* **ADR-027** — remains Accepted and unchanged, including Retry/JBI → `escalated_to_jbi`. "The final action is produced by explicit user interaction" applies to the pending / user-action path. `accepted` from inference (ADR-006) is a final inference outcome recorded by `/api/match/sign`, not an explicit confirmation.
* **ADR-037** — remains the historical record of the `/api/match/sign` HTTP contract. Its processing order gains step 6 (§5). Its request, response and error mapping are unchanged, except that a failure of the step-6 insert is fail-open (§6).

## 13. Consequences / trade-offs

* `/api/logs` rows are client-reported and cannot be verified by the stateless backend; metrics derived from them (PRD-BE §10) reflect what the kiosk reported. Rows written by `/api/match/sign` carry server-authoritative confidence.
* Escalation counts include Retry-from-pending and every JBI click, so an escalation count is an event count, not a count of distinct cases.
* Double clicks or future retries can create duplicate rows.
* Abandoned pending results are not represented in `matching_logs`.
* Fail-open may leave an inference outcome unrecorded when the database is unavailable during step 6.

## 14. Open items (not decided by this ADR)

The following details are not decided here and must be confirmed before the affected code path is implemented:

1. `predicted_phrase_id` of the step-6 row for an inference `escalated_to_jbi` caused by an inactive phrase (ADR-037 phrase policy): `null` (as in the response) or the matched phrase UUID.
2. Check order in `/api/logs` when both device and phrase are invalid (which 404/403 is returned first).
3. Whether a step-6 insert failure emits any server-side signal (for example an application log line without payload), or is silently ignored.

## 15. Open Items Resolution / Implementation Clarifications (ADR-038)

**Status:** CLOSED — owner-approved clarification (2026-09-29)

This section is part of ADR-038. It closes the three open items of §14 above. Sections 1–13 of ADR-038 (decisions D1–D7) are unchanged. No earlier ADR is changed.

### OI-1 — CLOSED

For the internal `/api/match/sign` log row (§5 step 6) whose final action is `escalated_to_jbi` because the Modeling phrase was found but is inactive / unusable under the ADR-037 phrase policy:

```text
predicted_phrase_id = null
```

The row records the final outcome actually given to the client, whose response already carries `phrase_id = null`. A phrase UUID that did not become a usable prediction is not stored. The phrase policy itself is unchanged.

### OI-2 — CLOSED

`POST /api/logs` validation order:

```text
request validation
→ device lookup
→ device active check
→ phrase lookup
→ insert
```

* unknown device → `404 DEVICE_NOT_FOUND`
* inactive device → `403 DEVICE_INACTIVE`
* valid active device + unknown phrase → `404 PHRASE_NOT_FOUND`

No phrase query is made before device validation passes.

### OI-3 — CLOSED

The step-6 internal log insert remains **fail-open** (§6). The client response is unchanged when the insert fails.

A server-side signal is optional. If one is used, it must be minimal and non-sensitive (for example `matching log insert failed`, or other non-sensitive metadata needed for debugging). It must not contain the request payload, the Sequence, landmarks, raw audio or video, patient data, or an exception dump that may carry such data. Silently ignoring the failure is also acceptable. Fail-open is not changed to fail-closed.

---

# ADR-039 — Admin Authentication & Authorization (Supabase JWT)

**Status:** Accepted (approved by the project owner, 2026-09-29)

**Scope:** Phase 5A — authentication and authorization for all `/api/admin/*` endpoints.

**Relates to:** ADR-012, ADR-019, ADR-022, ADR-029, ADR-032, ADR-037, ADR-038.
**Supersedes:** nothing. This ADR defines the authentication mechanism that ADR-019 and ADR-029 require but do not specify. It does not define any admin endpoint contract.

## Context

ADR-019 and ADR-029 require authentication for admin endpoints, and PRD-BE §2/§3 name Supabase Auth for admin/validator users only. No earlier ADR defines the token format, verification method, admin rule or error behavior.

Verified project facts (owner, 2026-09-29): the current Supabase signing key is ES256 (ECC, curve P-256); issuer `https://qshkdkmevbiaydkicihd.supabase.co/auth/v1`; audience `authenticated`; JWKS `https://qshkdkmevbiaydkicihd.supabase.co/auth/v1/.well-known/jwks.json`. A test user token carries `aud = authenticated`, that issuer, `role = authenticated`, and no admin role in `app_metadata`.

## D1 — Admin endpoints require Supabase Auth JWT

Every `/api/admin/*` endpoint requires:

```text
Authorization: Bearer <JWT>
```

The JWT must be issued by the Supabase Auth project used by JOINTS.

Public kiosk endpoints remain unauthenticated (ADR-019):

* `POST /api/match/sign`
* `POST /api/logs`
* `GET /api/phrases`

## D2 — Offline JWT verification with JWKS

The backend verifies JWTs with public keys from the Supabase JWKS. The JWKS endpoint is configured through the environment variable `SUPABASE_JWKS_URL`.

The Supabase service-role key is not used as an authentication mechanism for user requests.

## D3 — JWT algorithm

The backend accepts only:

```text
ES256
```

The algorithm taken from the JWT header is never trusted without this allowlist.

Approved dependencies for the implementation:

* `PyJWT[crypto]==2.15.1`
* `cryptography==50.0.1`

These dependencies are added only in the later authentication implementation task, not by this ADR.

## D4 — Required claim validation

Every JWT is validated for:

* signature
* `iss`
* `aud`
* `exp`
* `nbf`, if present

Configuration:

* `SUPABASE_JWT_ISSUER` — current deployment value: `https://qshkdkmevbiaydkicihd.supabase.co/auth/v1`
* `SUPABASE_JWT_AUDIENCE` — current deployment value: `authenticated`

`leeway = 0`. `exp` is required.

## D5 — Admin determination

A user is an admin only if the verified JWT contains:

```text
app_metadata.role == "admin"
```

The value must be exactly the string `admin`.

The following never grant admin access:

* `app_metadata` missing
* `app_metadata.role` missing
* role is not a string
* role is not `admin`
* role present only in `user_metadata`

`user_metadata` is never a source of authorization. Provisioning the admin role happens outside the backend authentication middleware.

## D6 — HTTP authorization semantics

If the token is:

* missing
* malformed
* signed with an invalid signature
* issued by an invalid issuer
* addressed to an invalid audience
* expired
* carrying an invalid required claim

the response is `401 UNAUTHORIZED`, using the existing error envelope, with the header:

```text
WWW-Authenticate: Bearer
```

If the JWT is valid but the user is not an admin, the response is `403 FORBIDDEN`, using the existing error envelope.

## D7 — JWKS caching

* Cache lifetime: `300 seconds`
* Network timeout: `2 seconds`

If the JWT `kid` is not in the cached JWKS, the backend may perform a forced JWKS refresh. Forced refreshes for unknown `kid` values have a cooldown of `30 seconds`.

A cache that is still valid is used without a network request.

If the cache has expired and the JWKS cannot be fetched or refreshed, authentication does not succeed, and the response is:

```text
503 AUTH_UNAVAILABLE
```

No custom stale-cache fallback is built beyond these agreed cache semantics.

## D8 — Environment configuration

Authentication configuration uses the environment variables:

* `SUPABASE_JWKS_URL`
* `SUPABASE_JWT_ISSUER`
* `SUPABASE_JWT_AUDIENCE`

Current deployment values:

```text
SUPABASE_JWKS_URL=https://qshkdkmevbiaydkicihd.supabase.co/auth/v1/.well-known/jwks.json
SUPABASE_JWT_ISSUER=https://qshkdkmevbiaydkicihd.supabase.co/auth/v1
SUPABASE_JWT_AUDIENCE=authenticated
```

No secret, token, private key or credential is added to the repository.

## D9 — Authorization boundary

The backend is the primary authorization boundary. The frontend is never the source of truth for whether a user is an admin.

RLS is not an MVP requirement for this decision. RLS is not forbidden for later phases and may be considered as defense-in-depth.

## D10 — Institution scoping

Institution-scoped admin authorization is not applied in the MVP, because:

* the MVP deployment serves one institution;
* there is no multi-tenant requirement yet;
* adding institution authorization now would expand Phase 5 scope unnecessarily.

Multi-tenant / institution-scoped authorization may become a separate decision in a later phase.

## D11 — Security non-goals

The Phase 5A implementation must not:

* accept a JWT without signature verification
* trust the JWT algorithm without the allowlist
* use an HS256 fallback
* use `user_metadata.role`
* use the service-role key to authorize users
* bypass authentication when the JWKS is unavailable
* write the raw JWT/token to logs

## D12 — Error semantics

Authentication/authorization errors use the existing error envelope (ADR-037, ADR-038):

```json
{ "error": { "code": "...", "message": "..." } }
```

Minimum error codes:

| Condition | HTTP | Code |
|---|---:|---|
| Missing / malformed / invalid / expired token (D6) | 401 | `UNAUTHORIZED` |
| Valid token, not admin | 403 | `FORBIDDEN` |
| JWKS unavailable, no valid cache (D7) | 503 | `AUTH_UNAVAILABLE` |

Error messages never reveal:

* the raw JWT
* the signing key
* any private key
* the JWKS response
* internal authentication details

## D13 — Implementation boundary

This ADR only records decisions. Authentication is implemented in a separate task/phase that must follow ADR-039.

That implementation includes at least:

* the approved JWT dependencies
* a JWKS client/cache
* JWT verification
* an admin authorization dependency
* automated tests

Nothing is implemented at the time this ADR is written.

---

# ADR-040 — Admin API Conventions

**Status:** Accepted (approved by the project owner, 2026-09-29)

**Scope:** `/api/admin/*` only. Public kiosk API contracts (`POST /api/match/sign`, `POST /api/logs`, `GET /api/phrases`, future `POST /api/match/text`) are unchanged.

**Relates to:** ADR-015, ADR-019, ADR-021, ADR-037, ADR-038, ADR-039.

## Decisions

1. **Validation.** Invalid body, query, path or JSON → `422 VALIDATION_ERROR`, using the existing error envelope.
2. **Conflict.** `409 CONFLICT`, generic message. Conflicting request values are never echoed.
3. **Not found.** `404` with resource-specific codes where already established (`PHRASE_NOT_FOUND`, `DEVICE_NOT_FOUND`). Additional resource-specific codes are introduced only where required.
4. **Pagination.** `page` default `1`, `page >= 1`. `page_size` default `50`, `1 <= page_size <= 100`. Invalid values → 422; values are never silently clamped.
5. **List response.**

   ```json
   { "items": [], "page": 1, "page_size": 50, "total": 0 }
   ```

6. `total` is mandatory for admin list endpoints.
7. Client-selectable sorting is not supported in the MVP.
8. Every list endpoint has deterministic server-side ordering: an endpoint-specific primary ordering field, with `id` as the final tie-breaker.
9. Admin request models reject unknown fields (`extra="forbid"` where applicable). Public endpoint behavior is not changed.
10. No generic body-size limit is introduced by this ADR. Reference upload limits belong to ADR-042.

Authentication/authorization errors remain as defined by ADR-039 (401 / 403 / 503).

No migration is required by ADR-040.

---

# ADR-041 — Admin Phrase Management

**Status:** Accepted (approved by the project owner, 2026-09-29)

**Endpoints:** `GET /api/admin/phrases`, `POST /api/admin/phrases`, `PATCH /api/admin/phrases/{id}`

**Relates to:** ADR-008, ADR-009, ADR-019, ADR-033, ADR-037, ADR-038, ADR-039, ADR-040, ADR-044.

## Decisions

1. `id` — immutable, system-generated UUID.
2. `phrase_text` — editable by admin. It remains a normal phrase/business text field. Changing it does not change `model_phrase_id`.
3. `category` — editable. Validated at application level against the documented project category values (`Pendaftaran`, `Keluhan`, `Obat`, `Administrasi`, `Fallback`; PRD §7, PRD-BE §7). No DB CHECK migration in this phase.
4. `language_variant` — read-only. Existing schema/default behavior applies.
5. `active` — editable by admin. Deactivation is the supported removal mechanism.
6. `model_phrase_id` — read-only to admin. Controlled by the Modeling artifact / seed / migration lifecycle (ADR-008, ADR-033). Admin CRUD does not allow changing it.
7. `sign_recognizable` — read-only to admin. Controlled by the Modeling artifact / seed / migration lifecycle (ADR-009, ADR-033). Admin CRUD does not allow changing it.
8. `aliases` — not stored in the Backend DB in this phase. No migration. Ownership belongs to ADR-044.
9. `created_at` / `updated_at` — not added to the phrase schema in this phase. No migration.
10. Duplicate `model_phrase_id` — relies on the existing DB uniqueness; a violation is translated to `409 CONFLICT`.
11. Duplicate `phrase_text` — no new DB unique constraint in this phase. If application validation detects a conflicting phrase, the response is `409 CONFLICT`. No migration solely for `phrase_text` uniqueness.
12. DELETE — not implemented.
13. `GET /api/admin/phrases` — returns all phrases, including inactive. Response fields: `id`, `phrase_text`, `category`, `language_variant`, `active`, `model_phrase_id`, `sign_recognizable`. Default ordering: `phrase_text ASC, id ASC`.
14. No custom sorting.
15. ADR-040 pagination applies.
16. No `aliases` field in the response.

No migration is required by ADR-041.

---

# ADR-042 — Sign Reference & Storage

**Status:** Accepted for MVP (approved by the project owner, 2026-09-29)

**Endpoint:** `POST /api/admin/phrases/{id}/references`

**Relates to:** ADR-010, ADR-012, ADR-019, ADR-039, ADR-040, ADR-041.

**Clarifies:** ADR-010 ("one canonical approved video per phrase") is enforced at DB level; the tie-break request in PRD-BE §4.2 is not adopted. The landmark-extraction trigger described in PRD-BE §4.5 is not part of the MVP (decision 14).

## Decisions

1. A phrase may have **at most one** approved reference.
2. Enforced at DB level with a partial unique index: unique `phrase_id` where `approved = true`.
3. No tie-breaking among multiple approved references; only one approved reference can exist.
4. A reference uploaded by the authenticated admin is immediately approved (`approved = true`).
5. A separate validator role and approval endpoint are not part of the MVP.
6. If an approved reference already exists for the phrase → `409 CONFLICT`. The existing reference is never silently replaced or unapproved.
7. Storage:
   * private Supabase Storage bucket;
   * no permanent public URLs;
   * object paths are generated by the Backend; the client cannot choose an arbitrary object path;
   * an existing object is never overwritten.
8. The Storage object reference/path is stored in the existing `video_url` field, following the repository's existing convention. No new URL column.
9. Signed URLs are returned/used when a client needs access to the private video. No permanent public access.
10. No storage metadata columns in this phase.
11. No timestamps on `sign_references` in this phase.
12. No additional signer identity/PII. Existing `signer_id` behavior is kept only if required by the current schema/contract.
13. Consent: no new consent subsystem. Reference signer consent is handled outside this system (PRD-BE §8).
14. Landmark extraction:
    * the Backend does not trigger `extract.py`;
    * no Backend→Modeling extraction endpoint is introduced;
    * `landmark_data` is not populated merely because the column exists; it follows the existing schema behavior.
15. The reference endpoint requires the target phrase to exist; a missing phrase → `404 PHRASE_NOT_FOUND`.
16. `sign_recognizable = true` is not required for a reference. Flow B uses approved references independently of sign-recognition capability.
17. Storage MIME/size: use a concrete project-defined limit if one exists in the repository/Supabase configuration. Otherwise no arbitrary numeric limit is invented; the missing deployment-level limit is reported.
18. If the repository has a configured bucket, it is used. If not, the reference implementation stops at the Storage integration boundary and `STORAGE_BUCKET_NOT_CONFIGURED` is reported. No bucket name is invented.

## Migration

Required: one partial unique index for one approved reference per phrase. No other schema migration without explicit approval.

---

# ADR-043 — Admin Logs & Devices

**Status:** Accepted (approved by the project owner, 2026-09-29)

**Endpoints:** `GET /api/admin/logs`, `GET /api/admin/devices`

**Relates to:** ADR-012, ADR-019, ADR-038, ADR-039, ADR-040.

## Logs

1. Read-only.
2. Returns existing `matching_logs` metadata only: `id`, `device_id`, `direction`, `predicted_phrase_id`, `confidence`, `resulted_action`, `created_at`.
3. Never returns raw video, raw audio, landmarks, Sequence, patient data or raw request payload.
4. No phrase/device joins in the MVP; IDs only.
5. Default order: `created_at DESC, id DESC`.
6. Supported filters: `device_id`, `predicted_phrase_id`, `resulted_action`, `direction`, date range.
7. ADR-040 pagination applies.
8. No client sorting.
9. No aggregation/metrics endpoint.
10. No CSV/export endpoint in this phase; logs are retrieved as JSON.
11. Retention policy is outside this endpoint and not implemented here.

## Devices

1. GET only. No POST/PATCH/DELETE device management in the MVP.
2. Returns `id`, `institution_id`, `label`, `active`.
3. No credentials/secrets returned.
4. No institution authorization/scoping (ADR-039 D10).
5. Default order: `label ASC, id ASC`.
6. ADR-040 pagination applies.
7. No institution joins in the MVP.

No migration is required by ADR-043.

---

# ADR-044 — Text Matching Ownership

**Status:** Accepted for the current architecture (approved by the project owner, 2026-09-29)

**Relates to:** ADR-006, ADR-013, ADR-014, ADR-017, ADR-036, ADR-041, ADR-042.

**Supersedes:** only the portion of ADR-017 that makes the Backend the semantic text-matching implementation owner ("Backend text matching … matching it against the approved phrase vocabulary and aliases"). All non-conflicting portions of ADR-017 remain in force: purpose, flow to an approved sign reference, phrase resolution, approved-reference retrieval, and "not required to perform unrestricted natural-language translation".

## Decisions

1. Semantic text matching belongs to **Modeling**.
2. The Backend does not implement its own embedding model, semantic similarity, cosine matching or semantic candidate ranking.
3. Backend responsibilities: request validation, orchestration, calling Modeling, business threshold/action decision, phrase lookup, approved reference lookup, response formatting, logging where applicable.
4. Modeling responsibilities: semantic text matching, candidate selection, model-specific confidence.
5. `/api/match/text` calls Modeling; it does not implement semantic matching locally.
6. Text confidence uses the same product thresholds unless a later explicit ADR changes them: `>= 0.85` accepted; `0.60–<0.85` pending_confirmation; `< 0.60` escalated_to_jbi.
7. The Backend re-enforces the action from the returned confidence.
8. A Modeling rejection/no-match is never forced to the nearest phrase.
9. The Backend does not own aliases in this phase. The existing Modeling artifact remains the temporary alias source.
10. No aliases DB migration.
11. No embedding-cache DB migration.
12. ADR-017 is superseded only as stated above.
13. Before `/api/match/text` is implemented, the Modeling contract must be verified against the current authoritative Modeling artifact/branch.
14. The existence of two Modeling PRDs (`main:PRD-Modeling.md` and `PRD-modeling.md` on the Modeling branch) is not resolved by assumption. The actual Modeling implementation/contract is the technical evidence, and the documentation mismatch is reported.
15. If a complete Modeling `matchText` interface does not exist, it is not invented; the missing contract is reported as a blocker.

No migration is required by ADR-044.

---

# ADR-045 — Adoption of Modeling Artifact 20260930-0122 (32-Label MVP Vocabulary)

**Status:** Accepted (approved by the project owner, 2026-09-29)

**Relates to:** ADR-005, ADR-008, ADR-009, ADR-033, ADR-041, ADR-044.

**Relationship to ADR-033:** ADR-033 named artifact `20260928-1331` (10 recognizable classes) as the current implementation reference and required a review before a new artifact is adopted. This ADR is that review and adoption record. It **supersedes ADR-033 only as to which artifact is the current reference**; ADR-033's rule that future artifacts must be reviewed before adoption remains in force.

**Relationship to ADR-009:** ADR-009's principles are unchanged: vocabulary is data, `sign_recognizable` and `active` are independent, and the recognizable list is never hardcoded. Its statement that the current artifact recognizes 10 classes described the previous artifact and is replaced by §2 below.

## 1. Artifact adopted

* Modeling branch commit: `00397cd` ("modeling 2.0")
* Artifact version: `20260930-0122` (`ml/artifacts/version.json`)
* `model_info.json`: `n_known = 32`, `known_labels = 0–31`, `none_class = true`, `none_index = 32`
* No Modeling code or artifact changes are made by the Backend.

## 2. Vocabulary

* The Backend MVP vocabulary baseline is the **32 labels** of this artifact; all 32 are sign-recognizable.
* `ml/artifacts/label_map.json` is the source for `model_phrase_id` (`phraseId`) and `phrase_text` (`text`). Class indices are never used as mapping keys (ADR-008).
* The 10 existing phrases (Phase 3 seed) are retained unchanged, including their categories.
* 22 new phrases are added with `sign_recognizable = true`, `active = true` and the schema default `language_variant`.

## 3. Category assignments for the 22 new phrases

Categories are MVP vocabulary metadata/routing only, not a claim that a word inherently belongs to that service category. Only the ADR-041 values are used.

| model_phrase_id | phrase_text | category |
|---|---|---|
| label_00 | Air | Fallback |
| label_01 | Belajar | Fallback |
| label_02 | Cari | Administrasi |
| label_03 | Hari | Administrasi |
| label_04 | Ingat | Fallback |
| label_07 | Makan | Fallback |
| label_08 | Motor | Fallback |
| label_12 | Apa | Administrasi |
| label_14 | Kapan | Administrasi |
| label_16 | Mengapa | Administrasi |
| label_18 | Merah | Fallback |
| label_19 | Kuning | Fallback |
| label_20 | Hijau | Fallback |
| label_21 | Hitam | Fallback |
| label_22 | Dengar | Keluhan |
| label_23 | Berangkat | Administrasi |
| label_25 | Teman | Fallback |
| label_26 | Keluarga | Pendaftaran |
| label_27 | Rumah | Fallback |
| label_28 | Pagi | Administrasi |
| label_29 | Siang | Administrasi |
| label_30 | Sore | Administrasi |

## 4. `audio` response field

The artifact adds an optional `audio` field to the Modeling sign response. The Backend ignores it: no DB column, no API response field, no logging, no audio endpoint, and `ml/artifacts/audio/` is not served. Any future audio serving requires a separate decision. The rest of the Modeling response contract (ADR-005) is unchanged.

## 5. Consequences

* The Backend runtime must use this artifact together with the 22-phrase seed; running the artifact without the seed would turn predictions of the new labels into `MODEL_MAPPING_ERROR`.
* A future artifact again requires review under ADR-033.

---

# ADR-046 — Supabase Storage Configuration for Sign References

**Status:** Accepted (approved by the project owner, 2026-09-29)

**Relates to:** ADR-010, ADR-012, ADR-039, ADR-040, ADR-042.

**Relationship to ADR-042:** ADR-042 is unchanged. This ADR records the concrete values that ADR-042 §17–§18 left to project configuration, and the Storage integration mechanism.

## Decisions

1. **Bucket:** `sign-references`, **private**. Configured through `SUPABASE_STORAGE_BUCKET`. The Backend never creates, reconfigures or publishes buckets; bucket provisioning happens in the Supabase project.
2. **Allowed MIME types:** `video/mp4`, `video/webm`.
3. **Maximum size:** 50 MB per reference file.
4. **Signed URL TTL:** 3600 seconds. Signed URLs are generated on demand and never stored; the DB keeps only the object path in `video_url` (ADR-042 §8–§9).
5. **Credential:** `SUPABASE_SERVICE_ROLE_KEY`, used **only** for server-side Backend → Supabase Storage operations. It is an environment/deployment secret; it never reaches the frontend, API responses, logs or the database, and is never used for user authentication (ADR-039 D2 unchanged).
6. **Project URL:** `SUPABASE_URL`, from environment configuration.
7. **Client:** the Supabase Storage REST API over `httpx` (moved from test-only to a runtime dependency, same pinned version). `supabase-py` is not added. Multipart parsing of the admin upload uses `python-multipart`, the parser FastAPI/Starlette require for form data (exact pin).
8. **Storage errors:** Storage unavailable, misconfigured or failing → `503 STORAGE_ERROR` (the code listed in AGENTS §30), existing error envelope, generic message.
9. No real secrets are committed; `.env.example` may contain placeholders only.

---

# ADR-047 — Staff Dashboard, Staff Authentication & Kiosk Operations

**Status:** Accepted (approved by the project owner, 2026-10-02)

**Relates to:** ADR-001, ADR-012, ADR-019, ADR-027, ADR-038, ADR-039, ADR-043, ADR-044, ADR-046; `REKOMENDASI_BACKEND_DAN_DATABASE.md` (recommendation input, not a source of truth by itself).

**Supersedes (partially, only as stated):**

* PRD §"Tidak ada dashboard B2G di fase MVP" / PRD-BE §1, §11 ("dashboard admin di luar scope"), and AGENTS §1 / §38 — only to the extent that a **staff (petugas) dashboard with per-staff login** becomes MVP scope (D1). The kiosk itself still has no login (D7); patient accounts, daily kiosk login, multi-device sessions and a B2G analytics dashboard remain out of scope.
* ADR-039 D5 — the set of recognized `app_metadata.role` values is extended with `petugas` (D2). The admin rule (`app_metadata.role == "admin"`, exact string) is unchanged.
* ADR-039 D10 — institution scoping is applied to the new staff endpoints only (D3). Existing `/api/admin/*` endpoints from ADR-040–043 keep their unscoped behavior.
* ADR-039 D5 ("provisioning the admin role happens outside the backend authentication middleware") and ADR-046 §5 (service-role key used only for Storage) — extended for staff provisioning only (D4).
* ADR-038 §10 / ADR-012 log content — `matching_logs` may carry a nullable `staff_id` (D7) and JBI rows written by D9.

Everything not listed above remains in force, including ADR-039 D1–D4, D6–D9, D11–D13, ADR-044 and ADR-012.

## D1 — Scope

The staff dashboard and staff login are part of the official MVP scope. Staff accounts are created by the institution (admin); there is no public self-registration and no shared account.

## D2 — Role source of truth

* Authorization role is taken **only** from the verified JWT claim `app_metadata.role` (ADR-039 D2–D5).
* Recognized values: `admin`, `petugas` (exact strings). Any other value, a missing claim, or a role present only in `user_metadata` grants no staff or admin access.
* `staff_profiles.role` is a database mirror of the role for display and listing. It is never the authorization source.
* On every staff/admin request introduced by this ADR, the Backend also checks at runtime that the caller's `staff_profiles` row exists and has `active = true`. A missing or inactive profile is denied even if the JWT is still valid.

## D3 — Institution isolation

For the new staff endpoints introduced by this ADR, the caller's `institution_id` is taken from the caller's own `staff_profiles` row. It is never accepted from the request body, query or path as an authorization input. Data from other institutions is not returned or modified.

## D4 — Service-role key usage

`SUPABASE_SERVICE_ROLE_KEY` may additionally be used server-side to call the Supabase Auth Admin API in order to:

* create staff accounts;
* set `app_metadata.role` for those accounts.

It is never used to authorize a user request (ADR-039 D2, D11 unchanged), never returned to clients, never logged and never stored in the database.

## D5 — Login proxy

* `POST /api/auth/login` accepts an identifier (email, NIP or username) and a password.
* For NIP/username, the Backend resolves the associated account through `staff_profiles` and then verifies the credentials against the Supabase Auth token endpoint over `httpx` (no new SDK dependency).
* Every credential failure — unknown identifier, wrong password, unresolvable NIP/username — returns `401 INVALID_CREDENTIALS` with the same generic message. The response never reveals which part failed or whether an account exists.
* Passwords and tokens are never logged or stored by the Backend.

## D6 — Patient data

* No `patients` table, no medical-record number and no patient PII are introduced in the MVP. `matching_logs.patient_id` is not added.
* The dashboard "patient information" widget uses an **ephemeral queue** for the demo UI only; it is not persisted as patient data.
* Any persistent patient data requires a separate privacy ADR (ADR-012 remains in force).

## D7 — Log attribution

* The kiosk stays unauthenticated (ADR-019, ADR-039 D1 unchanged). Public kiosk endpoint contracts are unchanged.
* `matching_logs.staff_id` is a nullable column. It is filled only when a request carries a valid staff JWT from the dashboard; otherwise it is `NULL`.

## D8 — Kiosk status

* Devices carry a `last_heartbeat_at` timestamp updated by the heartbeat endpoint.
* Online/offline status is **computed** at read time: `online` if `now - last_heartbeat_at < 90 seconds`, otherwise `offline` (including when `last_heartbeat_at` is `NULL`).
* No static `status` column is added. An `in_use` status is not part of this decision.

## D9 — JBI call

* `POST /api/kiosk/call-jbi` requires a valid staff JWT (D2).
* It writes one row to `jbi_dispatches` and one row with `resulted_action = 'escalated_to_jbi'` to `matching_logs` (with `staff_id` set per D7).

## D10 — Text matching

`POST /api/match/text` remains **blocked** until the Modeling team delivers a `matchText` contract (ADR-044 D13, D15 unchanged). This ADR does not authorize Backend-side semantic matching.

## Open items (not decided by this ADR)

These must be decided before the corresponding implementation step; they are not to be assumed:

1. Exact `staff_profiles` and `jbi_dispatches` columns, constraints and FK behavior (e.g. `on delete` for `auth.users`), and which columns are required.
2. Name of the configuration value used to call the Supabase Auth token endpoint (e.g. anon/publishable key) and the login response shape (which token fields are returned).
3. Login rate limiting / brute-force protection.
4. Authentication of `POST /api/devices/{device_id}/heartbeat` (devices currently have no credential, ADR-043) and authorization of `GET /api/devices/{device_id}/status`.
5. Where the ephemeral queue lives (frontend only vs. Backend in-memory) and whether any endpoint is needed for it.
6. Authentication/authorization of `GET /api/references` and `GET /api/staff/logs`, their response fields and pagination (ADR-040 applies to admin lists only).
7. `jbi_dispatches` status lifecycle and the `direction` / `predicted_phrase_id` / `confidence` values of the D9 `matching_logs` row.
8. `PATCH /api/admin/staff/{id}` and password reset, mentioned in the recommendation document, are not part of this decision.

## Migration

This ADR authorizes, in a later implementation task: a `staff_profiles` table, a `jbi_dispatches` table, `devices.last_heartbeat_at`, and nullable `matching_logs.staff_id`. Migrations must be non-destructive. No migration is written by this ADR.

---

# ADR-048 — Staff Dashboard Schema Refinements

**Status:** Accepted (approved by the project owner, 2026-10-02)

**Relates to:** ADR-012, ADR-039, ADR-047.

**Resolves:** ADR-047 open item 1 (columns, constraints and FK behavior of `staff_profiles` and `jbi_dispatches`) and the `jbi_dispatches.status` value set from open item 7. The rest of open item 7 (lifecycle transitions, values of the D9 `matching_logs` row) stays open. ADR-047 is otherwise unchanged.

## Decisions

1. **`staff_profiles` columns:** `id` (PK, FK `auth.users(id)` `on delete cascade`), `institution_id` (not null, FK `institutions`), `nip` (`varchar(50)`, unique, nullable), `username` (`varchar(50)`, unique, nullable), `full_name` (not null), `role` (not null, check `admin` | `petugas`), `unit_kerja` (not null), `job_title` (not null), `shift_schedule`, `avatar_url`, `active` (`boolean not null default true`), `created_at` (`timestamptz default now()`).
2. **Indexes:** `staff_profiles(institution_id)`. `nip` and `username` rely on their UNIQUE-constraint indexes; no duplicate indexes.
3. **`jbi_dispatches` columns:** `id` (PK, `gen_random_uuid()`), `institution_id`, `device_id`, `staff_id` — all **NOT NULL** FKs; `notes`; `status` (`not null default 'requested'`, check `requested` | `accepted` | `completed` | `cancelled`, values from `REKOMENDASI_BACKEND_DAN_DATABASE.md` §2.5); `created_at`.
4. **Audit trail:** staff removal is a **soft delete** (`active = false`). `matching_logs.staff_id` and `jbi_dispatches.staff_id` use `ON DELETE RESTRICT`, so a staff profile referenced by history cannot be hard-deleted (including via the `auth.users` cascade).
5. **RLS:** row level security is enabled **without policies** on `staff_profiles` and `jbi_dispatches`, so Supabase Data API roles get no access. The Backend's direct database connection is unaffected. This is defense-in-depth permitted by ADR-039 D9; RLS on existing tables is not part of this decision.
6. **Tests:** PostgreSQL test fixtures provide a stand-in `auth.users` table when the test database has no Supabase `auth` schema. This stand-in is test-only and never created by a migration.

# ADR-049 — 43-Label Vocabulary (artifact 20261006-1528)

**Status:** Accepted (requested by the project owner, 2026-10-06)
**Relates to:** ADR-009, ADR-045.
**Extends:** ADR-045 (32 labels). ADR-045 rows are unchanged.

## Decisions
1. **Adopted artifact:** `ml/artifacts` version `20261006-1528` ("modeling 4.0", `n_known = 43`, `none_index = 43`). The 11 new labels `label_32` … `label_42` are seeded in `phrases` with `phrase_text` exactly as in `label_map.json`, `sign_recognizable = true`, `active = true`.
2. **Categories (general-use words, owner may re-assign via the admin API):** Berapa → `Administrasi`; Tidur → `Keluhan`; Apa kabar, Baik, Bingung, Halo, Kamu, Selamat pagi / siang / sore / malam → `Fallback`.
3. **Migration:** `Database/migrations/20261006000000_adr049_seed_43_label_vocabulary.sql`, idempotent (`on conflict (model_phrase_id) do nothing`), no update/delete.
4. **Unchanged:** confidence thresholds (ADR-006/007: accept ≥ 0.85, confirm ≥ 0.60), API contract, schema. The artifact's own `kiosk_accept = 0.65` stays advisory only.
5. **Frontend quick phrases (Alur B, panel petugas):** the "Frasa cepat" list shows general words from the model vocabulary (Apa, Apa kabar, Bagaimana, Baik, Berapa, Bingung, Halo, Kapan, Kamu, Saya, Tidur, Selamat pagi / siang / sore / malam, Terima kasih), because Puskesmas-specific sentence data is not yet available. This is FE display data only; it does not change matching.

# ADR-050 — Interim Frontend Tokenizer for Speech/Text → Sign (Alur B)

**Status:** Accepted as interim (requested by the project owner, 2026-10-07)
**Relates to:** ADR-017, ADR-047 D10, ADR-049.
**Superseded when:** the Modeling team delivers a `matchText` contract and `POST /api/match/text` is implemented (ADR-017 / ADR-047 D10). The tokenizer then moves behind that endpoint.

## Decisions
1. **Where:** until `/api/match/text` exists, the kiosk FE matches the officer's utterance locally (`Frontend/main/src/services/textMatch.ts`). No Backend change; ADR-047 D10 stays in force.
2. **How (dictionary lookup, not inference):** lowercase, strip punctuation, split on whitespace; match the **longest** form first against the model vocabulary text + `aliases` from `ml/artifacts/label_map.json` (copied to `src/data/vocabulary.ts` by `scripts/sync-vocabulary.mjs`); suffixes `-nya/-lah/-kah/-pun` allowed. Words outside the vocabulary are shown as text only and are never guessed.
3. **Decision:** an exact dictionary match is `accepted` (confidence 1). If no word matches, the result is NO_MATCH (text + Panggil JBI). Sign → text thresholds (ADR-006/007) are unchanged.
4. **Playback:** matched words are played as one continuous animation (start/end hold only once, ~150 ms transitions, resting/still frames trimmed at word joins).
5. **Logging:** speech_to_sign results are logged locally only; `/api/logs` still rejects `speech_to_sign` (unchanged).
