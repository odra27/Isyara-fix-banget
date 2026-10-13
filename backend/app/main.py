"""FastAPI application.

Run (Python 3.12, from backend/, with DATABASE_URL set):
    uvicorn app.main:app

Lifespan: the Modeling client is created once at startup and reused (AGENTS §29).
If it cannot be loaded, the app still starts and /api/match/sign answers 503
MODELING_UNAVAILABLE until the process is restarted.

Only the approved endpoints (POST /api/match/sign, POST /api/logs, GET /api/phrases) are exposed:
framework docs/OpenAPI routes are disabled. `/api/admin/*` is mounted through the admin
router, whose `require_admin` dependency enforces ADR-039. Staff login and profile
(POST /api/auth/login, GET /api/me) follow ADR-047; the Supabase Auth client is created
once at startup — if its configuration is missing, login answers 503 AUTH_UNAVAILABLE.
Student login / profile (POST /api/student/auth/login, GET /api/student/me) and the chatbot
(/api/chat/*) follow ADR-051; the chat model is OpenRouter when OPENROUTER_API_KEY is set,
otherwise an offline stand-in that answers honestly that no model is connected.
Errors use the ADR-037 envelope. No request bodies are logged.
"""
from __future__ import annotations

import os
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.chat import router as chat_router
from app.api.kiosk import router as kiosk_router
from app.api.student import router as student_router
from app.chat.model import ChatModel, OfflineChatModel, chat_model_from_env
from app.api.errors import from_backend_error, from_error_list, from_unexpected_error
from app.api.health import router as health_router
from app.api.logs import router as logs_router
from app.api.phrases import router as phrases_router
from app.api.sign import router as sign_router
from app.db.session import OpenDb, open_postgres
from app.errors import BackendError, ModelingUnavailable
from app.auth.jwt_verifier import JwtVerifier
from app.auth.supabase_auth import SupabaseAuthClient
from app.modeling.client import LibraryModelingClient, ModelingClient
from app.provisioning.supabase_admin import SupabaseAdminClient
from app.storage.supabase import SupabaseStorage

ModelingFactory = Callable[[], ModelingClient]
JwtVerifierFactory = Callable[[], JwtVerifier]
StorageFactory = Callable[[], SupabaseStorage]
AuthClientFactory = Callable[[], SupabaseAuthClient]
AuthAdminFactory = Callable[[], SupabaseAdminClient]
ChatModelFactory = Callable[[], ChatModel]

# Origin FE yang boleh memanggil API dari browser. Default = Vite dev server lokal
# (main: 5174, landing: 5173). Production: set CORS_ALLOW_ORIGINS (dipisah koma).
_DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173,http://localhost:5174,"
    "https://localhost:5174,http://127.0.0.1:5174,https://127.0.0.1:5174"
)


def cors_origins() -> list[str]:
    raw = os.environ.get("CORS_ALLOW_ORIGINS", _DEFAULT_CORS_ORIGINS)
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def create_app(
    *,
    modeling_factory: ModelingFactory = LibraryModelingClient.load,
    open_db: OpenDb = open_postgres,
    jwt_verifier_factory: JwtVerifierFactory = JwtVerifier.from_env,
    storage_factory: StorageFactory = SupabaseStorage.from_env,
    auth_client_factory: AuthClientFactory = SupabaseAuthClient.from_env,
    auth_admin_factory: AuthAdminFactory = SupabaseAdminClient.from_env,
    chat_model_factory: ChatModelFactory = chat_model_from_env,
) -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        try:
            app.state.modeling = modeling_factory()
        except ModelingUnavailable:
            app.state.modeling = None
        # One JWKS client/cache per process (ADR-039 D7). Construction does no
        # network I/O; if it fails, admin requests answer 503 AUTH_UNAVAILABLE.
        try:
            app.state.jwt_verifier = jwt_verifier_factory()
        except Exception:
            app.state.jwt_verifier = None
        # Storage client (ADR-046). Missing config → reference upload answers 503 STORAGE_ERROR.
        try:
            app.state.storage = storage_factory()
        except Exception:
            app.state.storage = None
        # Supabase Auth password grant (ADR-047 D5). Missing config → login 503 AUTH_UNAVAILABLE.
        try:
            app.state.auth_client = auth_client_factory()
        except Exception:
            app.state.auth_client = None
        # Supabase Auth Admin API for staff provisioning (ADR-047 D4). Missing config →
        # POST /api/admin/staff answers 503 AUTH_UNAVAILABLE.
        try:
            app.state.auth_admin = auth_admin_factory()
        except Exception:
            app.state.auth_admin = None
        # Chatbot model (ADR-051 D3). A broken config falls back to the offline stand-in.
        try:
            app.state.chat_model = chat_model_factory()
        except Exception:
            app.state.chat_model = OfflineChatModel()
        try:
            yield
        finally:
            close = getattr(app.state.modeling, "close", None)
            if close is not None:
                close()
            if app.state.storage is not None:
                await app.state.storage.aclose()
            if app.state.auth_client is not None:
                await app.state.auth_client.aclose()
            if app.state.auth_admin is not None:
                await app.state.auth_admin.aclose()
            if app.state.chat_model is not None:
                await app.state.chat_model.aclose()

    app = FastAPI(lifespan=lifespan, docs_url=None,
                  redoc_url=None, openapi_url=None)
    app.state.modeling = None
    app.state.jwt_verifier = None
    app.state.storage = None
    app.state.auth_client = None
    app.state.auth_admin = None
    app.state.chat_model = None
    app.state.open_db = open_db

    # Tanpa ini browser memblokir semua request FE (beda port = beda origin).
    # Bearer token dikirim lewat header Authorization, bukan cookie → allow_credentials tidak perlu.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins(),
        allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    @app.exception_handler(RequestValidationError)
    async def _validation(_request: Request, exc: RequestValidationError) -> JSONResponse:
        status, body = from_error_list(exc.errors())
        return JSONResponse(status_code=status, content=body)

    @app.exception_handler(BackendError)
    async def _backend(_request: Request, exc: BackendError) -> JSONResponse:
        status, body = from_backend_error(exc)
        return JSONResponse(status_code=status, content=body, headers=exc.headers)

    @app.exception_handler(Exception)
    async def _unexpected(_request: Request, exc: Exception) -> JSONResponse:
        status, body = from_unexpected_error(exc)
        return JSONResponse(status_code=status, content=body)

    app.include_router(sign_router)
    app.include_router(logs_router)
    app.include_router(phrases_router)
    # /api/admin/*, protected by require_admin (ADR-039)
    app.include_router(admin_router)
    app.include_router(auth_router)  # /api/auth/login, /api/me (ADR-047)
    # heartbeat/status, call-jbi, demo queue, staff logs (ADR-047)
    app.include_router(kiosk_router)
    app.include_router(student_router)  # /api/student/auth/login, /api/student/me (ADR-051)
    app.include_router(chat_router)  # /api/chat/* (ADR-051)
    app.include_router(health_router)  # GET /api/health (dev/ops check)
    return app


def default_open_db() -> OpenDb:
    """LOCAL_DEV_DB=1 → database in-memory (seed dari Database/migrations), tanpa Supabase."""
    if os.environ.get("LOCAL_DEV_DB") == "1":
        from app.db.local import make_open_local

        return make_open_local()
    return open_postgres


app = create_app(open_db=default_open_db())
