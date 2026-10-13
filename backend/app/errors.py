"""Structured backend errors (AGENTS §30, ADR-015, approved Phase 3 error contract).

Each error carries a stable `code` and the approved HTTP status:

    VALIDATION_ERROR      422
    DEVICE_NOT_FOUND      404
    DEVICE_INACTIVE       403
    PHRASE_NOT_FOUND      404   (/api/logs only, ADR-038)
    PAYLOAD_TOO_LARGE     413
    MODELING_TIMEOUT      504
    MODELING_UNAVAILABLE  503
    MODEL_MAPPING_ERROR   500
    INTERNAL_ERROR        500
    UNAUTHORIZED          401   (/api/admin/*, ADR-039; adds WWW-Authenticate: Bearer)
    FORBIDDEN             403   (/api/admin/*, ADR-039)
    CONFLICT              409   (/api/admin/*, ADR-040)
    STORAGE_ERROR         503   (reference upload, ADR-046)
    AUTH_UNAVAILABLE      503   (/api/admin/*, ADR-039; staff auth + login, ADR-047)
    INVALID_CREDENTIALS   401   (POST /api/auth/login, ADR-047 D5; one generic message)

Messages must never contain patient input (landmarks, audio, video) — ADR-012.
"""
from __future__ import annotations


class BackendError(Exception):
    code: str = "INTERNAL_ERROR"
    http_status: int = 500
    headers: dict[str, str] | None = None  # extra response headers (ADR-039 D6: 401)

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class Unauthorized(BackendError):
    """Missing/malformed/invalid/expired admin credentials (ADR-039 D6, D12)."""

    code = "UNAUTHORIZED"
    http_status = 401
    headers = {"WWW-Authenticate": "Bearer"}


class Forbidden(BackendError):
    """Valid JWT, but not an admin (ADR-039 D5, D6)."""

    code = "FORBIDDEN"
    http_status = 403


class AuthUnavailable(BackendError):
    """JWKS cannot be obtained, so no token can be verified (ADR-039 D7, D12)."""

    code = "AUTH_UNAVAILABLE"
    http_status = 503


class InvalidCredentials(BackendError):
    """Any login credential failure (ADR-047 D5). Never says which part failed."""

    code = "INVALID_CREDENTIALS"
    http_status = 401


class DeviceNotFound(BackendError):
    """device_id does not exist in devices (ADR-011, ADR-037)."""

    code = "DEVICE_NOT_FOUND"
    http_status = 404


class DeviceInactive(BackendError):
    """Device exists but is not active (ADR-011, ADR-037)."""

    code = "DEVICE_INACTIVE"
    http_status = 403


class PhraseNotFound(BackendError):
    """/api/logs predicted_phrase_id does not exist in phrases (ADR-038 §4)."""

    code = "PHRASE_NOT_FOUND"
    http_status = 404


class Conflict(BackendError):
    """Admin write conflicts with existing data (ADR-040 §2). Never echoes values."""

    code = "CONFLICT"
    http_status = 409


class StorageError(BackendError):
    """Supabase Storage unavailable, misconfigured or failing (ADR-046 §8)."""

    code = "STORAGE_ERROR"
    http_status = 503


class PayloadTooLarge(BackendError):
    """Sequence exceeds the Modeling frame limit (ADR-015)."""

    code = "PAYLOAD_TOO_LARGE"
    http_status = 413


class ModelMappingError(BackendError):
    """Modeling phraseId has no usable phrases.model_phrase_id match (ADR-008)."""

    code = "MODEL_MAPPING_ERROR"
    http_status = 500


class ModelingTimeout(BackendError):
    """Modeling did not answer within the 3 s budget (ADR-014)."""

    code = "MODELING_TIMEOUT"
    http_status = 504


class ModelingUnavailable(BackendError):
    """Modeling predictor could not be loaded / reached."""

    code = "MODELING_UNAVAILABLE"
    http_status = 503


class ModelingInternalError(BackendError):
    """Modeling failed during inference or returned a contract-violating response."""

    code = "INTERNAL_ERROR"
    http_status = 500
