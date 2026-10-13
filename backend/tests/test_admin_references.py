"""POST /api/admin/phrases/{id}/references (ADR-042, ADR-046). Fake repo + mocked Storage REST."""
import logging
from uuid import UUID, uuid4

import psycopg.errors
import pytest

from app.db.admin import AdminPhrase, AdminReference
from app.storage.supabase import MAX_REFERENCE_BYTES, SIGNED_URL_TTL_S, StorageConfig, StorageNotConfigured
from tests.admin_support import FakeAdminDb, FakeStorageServer, admin_auth, admin_client  # noqa: F401

PID = UUID("00000000-0000-0000-0000-0000000000b1")
URL = f"/api/admin/phrases/{PID}/references"
MP4 = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 64
WEBM = b"\x1a\x45\xdf\xa3" + b"\x00" * 64


class Repo:
    def __init__(self):
        self.phrases = {PID: AdminPhrase(PID, "Air", "Fallback", "BISINDO-Jakarta", True, "label_00", True)}
        self.approved: set[UUID] = set()
        self.inserted: list = []
        self.insert_error: Exception | None = None
        self.calls: list = []

    async def get_phrase(self, pid):
        self.calls.append("get_phrase")
        return self.phrases.get(pid)

    async def has_approved_reference(self, pid):
        self.calls.append("has_approved")
        return pid in self.approved

    async def insert_approved_reference(self, *, reference_id, phrase_id, video_url):
        self.calls.append("insert")
        if self.insert_error:
            raise self.insert_error
        self.inserted.append((reference_id, phrase_id, video_url))
        self.approved.add(phrase_id)
        return AdminReference(reference_id, phrase_id, video_url, True)


@pytest.fixture
def storage():
    return FakeStorageServer()


@pytest.fixture
def repo():
    return Repo()


@pytest.fixture
def api(admin_auth, repo, storage):
    db = FakeAdminDb(repo)
    with admin_client(admin_auth, db.open, storage.factory()) as c:
        yield c, admin_auth, db


def upload(c, h, data=MP4, mime="video/mp4", filename="clip.mp4", extra=None, url=URL):
    files = [("file", (filename, data, mime))]
    return c.post(url, files=files, data=extra or None, headers=h)


def err(r, status, code):
    assert r.status_code == status, r.text
    assert r.json()["error"]["code"] == code


# ---- auth -------------------------------------------------------------------------------------

def test_auth_required_before_parsing_or_storage(admin_auth, repo, storage):
    db = FakeAdminDb(repo)
    with admin_client(admin_auth, db.open, storage.factory()) as c:
        err(upload(c, {}), 401, "UNAUTHORIZED")
        err(upload(c, {"Authorization": "Bearer not.a.jwt"}), 401, "UNAUTHORIZED")
        err(upload(c, admin_auth.non_admin_headers()), 403, "FORBIDDEN")
    assert db.opened == 0 and storage.requests == []


# ---- success ----------------------------------------------------------------------------------

@pytest.mark.parametrize(("data", "mime", "ext"), [(MP4, "video/mp4", "mp4"), (WEBM, "video/webm", "webm")])
def test_valid_upload_is_stored_approved_with_signed_url(api, repo, storage, data, mime, ext):
    c, auth, _ = api
    r = upload(c, auth.headers(), data=data, mime=mime, filename=f"../../etc/passwd.{ext}")
    assert r.status_code == 201, r.text
    b = r.json()
    ref_id = UUID(b["id"])
    expected_path = f"{PID}/{ref_id}.{ext}"
    assert b["video_url"] == expected_path and b["phrase_id"] == str(PID) and b["approved"] is True
    assert b["signed_url_expires_in"] == SIGNED_URL_TTL_S == 3600
    assert b["signed_url"].startswith("https://storage.test.invalid/storage/v1/object/sign/sign-references/")
    assert "ttl=3600" in b["signed_url"]
    # stored exactly once, in the configured bucket, under the server-generated path
    assert storage.objects == {f"sign-references/{expected_path}": data}
    assert repo.inserted == [(ref_id, PID, expected_path)]  # DB keeps the object path, not the signed URL
    up = storage.requests[0]
    assert up.method == "POST" and up.headers["x-upsert"] == "false" and up.headers["content-type"] == mime
    assert "passwd" not in str(up.url) and ".." not in str(up.url)  # client filename never used


def test_only_object_calls_no_bucket_or_public_endpoints(api, storage):
    c, auth, _ = api
    assert upload(c, auth.headers()).status_code == 201
    paths = [(r.method, r.url.path) for r in storage.requests]
    assert [m for m, _ in paths] == ["POST", "POST"]
    assert all(p.startswith("/storage/v1/object/") for _, p in paths)
    assert not any("/bucket" in p or "/public/" in p for _, p in paths)


def test_signed_url_failure_still_returns_created_reference(api, repo, storage):
    c, auth, _ = api
    storage.fail_sign = True
    r = upload(c, auth.headers())
    assert r.status_code == 201 and r.json()["signed_url"] is None and r.json()["signed_url_expires_in"] is None
    assert len(repo.inserted) == 1


# ---- validation → 422 -------------------------------------------------------------------------

@pytest.mark.parametrize(("data", "mime"), [
    pytest.param(MP4, "video/quicktime", id="mov"),
    pytest.param(MP4, "image/png", id="png"),
    pytest.param(MP4, "application/octet-stream", id="octet"),
    pytest.param(b"not a video at all", "video/mp4", id="mp4 declared, wrong content"),
    pytest.param(MP4, "video/webm", id="webm declared, mp4 content"),
    pytest.param(b"", "video/mp4", id="empty"),
])
def test_invalid_file_is_422(api, storage, data, mime):
    c, auth, db = api
    err(upload(c, auth.headers(), data=data, mime=mime), 422, "VALIDATION_ERROR")
    assert storage.requests == [] and db.opened == 0


def test_too_large_is_422_without_storage(api, storage):
    c, auth, _ = api
    big = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * (MAX_REFERENCE_BYTES + 1 - 12)
    err(upload(c, auth.headers(), data=big), 422, "VALIDATION_ERROR")
    assert storage.requests == []


def test_exactly_max_size_is_accepted(api, storage):
    c, auth, _ = api
    exact = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * (MAX_REFERENCE_BYTES - 12)
    assert upload(c, auth.headers(), data=exact).status_code == 201
    assert MAX_REFERENCE_BYTES == 50 * 1024 * 1024


@pytest.mark.parametrize("extra", [{"path": "evil/overwrite.mp4"}, {"bucket": "public"}, {"object_path": "x"}])
def test_client_path_or_bucket_fields_rejected(api, storage, extra):
    c, auth, _ = api
    err(upload(c, auth.headers(), extra=extra), 422, "VALIDATION_ERROR")
    assert storage.requests == []


def test_malformed_multipart_and_wrong_content_types(api, storage):
    c, auth, _ = api
    h = auth.headers()
    for content, ctype in [
        (b"--xx\r\nbroken", "multipart/form-data; boundary=xx"),
        (b"abc", "multipart/form-data"),
        (MP4, "video/mp4"),
        (b"file=abc", "application/x-www-form-urlencoded"),
    ]:
        err(c.post(URL, content=content, headers={**h, "content-type": ctype}), 422, "VALIDATION_ERROR")
    err(c.post(URL, files=[("file", ("a.mp4", MP4, "video/mp4")), ("file", ("b.mp4", MP4, "video/mp4"))], headers=h),
        422, "VALIDATION_ERROR")
    err(c.post(URL, files=[("video", ("a.mp4", MP4, "video/mp4"))], headers=h), 422, "VALIDATION_ERROR")
    err(c.post(URL, data={"file": "not-a-file"}, headers=h), 422, "VALIDATION_ERROR")
    assert storage.requests == []


def test_invalid_phrase_uuid_is_422(api):
    c, auth, _ = api
    err(upload(c, auth.headers(), url="/api/admin/phrases/label_00/references"), 422, "VALIDATION_ERROR")


# ---- phrase / conflict ------------------------------------------------------------------------

def test_missing_phrase_404_no_upload(api, storage):
    c, auth, _ = api
    err(upload(c, auth.headers(), url=f"/api/admin/phrases/{uuid4()}/references"), 404, "PHRASE_NOT_FOUND")
    assert storage.requests == []


def test_existing_approved_reference_409_no_upload(api, repo, storage):
    c, auth, _ = api
    repo.approved.add(PID)
    err(upload(c, auth.headers()), 409, "CONFLICT")
    assert storage.requests == [] and repo.inserted == []


def test_second_upload_409_and_first_kept(api, repo, storage):
    c, auth, _ = api
    first = upload(c, auth.headers())
    assert first.status_code == 201
    err(upload(c, auth.headers()), 409, "CONFLICT")
    assert len(repo.inserted) == 1 and len(storage.objects) == 1


def test_db_unique_violation_race_is_409_and_object_cleaned_up(api, repo, storage):
    c, auth, _ = api
    repo.insert_error = psycopg.errors.UniqueViolation("duplicate key (phrase_id)=(...)")
    r = upload(c, auth.headers())
    err(r, 409, "CONFLICT")
    assert "duplicate key" not in r.text
    methods = [x.method for x in storage.requests]
    assert methods == ["POST", "DELETE"] and storage.objects == {}


def test_db_failure_after_upload_is_500_and_cleanup_attempted(api, repo, storage):
    c, auth, _ = api
    repo.insert_error = psycopg.OperationalError("server closed connection host=db-secret")
    r = upload(c, auth.headers())
    err(r, 500, "INTERNAL_ERROR")
    assert "db-secret" not in r.text
    assert [x.method for x in storage.requests] == ["POST", "DELETE"] and storage.objects == {}


def test_cleanup_failure_does_not_mask_original_error(api, repo, storage):
    c, auth, _ = api
    repo.insert_error = psycopg.errors.UniqueViolation("dup")
    storage.fail_delete = True
    err(upload(c, auth.headers()), 409, "CONFLICT")


# ---- storage failures → 503 -------------------------------------------------------------------

def test_storage_upload_failure_503_and_no_db_insert(api, repo, storage):
    c, auth, _ = api
    storage.fail_upload = True
    err(upload(c, auth.headers()), 503, "STORAGE_ERROR")
    assert repo.inserted == [] and "insert" not in repo.calls


def test_storage_network_error_503(admin_auth, repo):
    import httpx

    from app.storage.supabase import SupabaseStorage

    def boom(_):
        raise httpx.ConnectError("connection refused to storage-host")

    cfg = StorageConfig(url="https://storage.test.invalid", bucket="sign-references", service_key="k-NOT-REAL")
    db = FakeAdminDb(repo)
    with admin_client(admin_auth, db.open, lambda: SupabaseStorage(cfg, transport=httpx.MockTransport(boom))) as c:
        r = upload(c, admin_auth.headers())
    err(r, 503, "STORAGE_ERROR")
    assert "storage-host" not in r.text


def test_storage_not_configured_503(admin_auth, repo):
    db = FakeAdminDb(repo)
    with admin_client(admin_auth, db.open) as c:  # default test factory raises → storage None
        err(upload(c, admin_auth.headers()), 503, "STORAGE_ERROR")
    assert repo.inserted == []


def test_existing_object_is_never_overwritten(storage):
    import asyncio

    from app.errors import StorageError

    s = storage.factory()()
    storage.objects["sign-references/p/r.mp4"] = b"original"

    async def run():
        try:
            with pytest.raises(StorageError):
                await s.upload("p/r.mp4", b"new", "video/mp4")
        finally:
            await s.aclose()

    asyncio.run(run())
    assert storage.objects["sign-references/p/r.mp4"] == b"original"


# ---- configuration & secret handling ----------------------------------------------------------

def test_config_from_env_requires_all_three(monkeypatch):
    for k in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"):
        monkeypatch.delenv(k, raising=False)
    with pytest.raises(StorageNotConfigured) as exc:
        StorageConfig.from_env()
    assert "SUPABASE_SERVICE_ROLE_KEY" in str(exc.value)
    monkeypatch.setenv("SUPABASE_URL", "https://x.supabase.co/")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "secret-NOT-REAL")
    monkeypatch.setenv("SUPABASE_STORAGE_BUCKET", "sign-references")
    cfg = StorageConfig.from_env()
    assert (cfg.url, cfg.bucket) == ("https://x.supabase.co", "sign-references")
    assert "secret-NOT-REAL" not in repr(cfg)
    monkeypatch.setenv("SUPABASE_URL", "ftp://x")
    with pytest.raises(StorageNotConfigured):
        StorageConfig.from_env()


def test_service_key_only_in_storage_request_headers_never_in_response_or_logs(api, storage, caplog):
    c, auth, _ = api
    key = FakeStorageServer.SERVICE_KEY
    with caplog.at_level(logging.DEBUG):
        r = upload(c, auth.headers())
        storage.fail_upload = True
        r2 = upload(c, auth.headers(), url=f"/api/admin/phrases/{PID}/references")
    assert r.status_code == 201
    for resp in (r, r2):
        assert key not in resp.text and key not in str(resp.headers)
    assert key not in caplog.text
    assert MP4.hex() not in caplog.text
    up = storage.requests[0]
    assert up.headers["apikey"] == key
    assert up.url.host == "storage.test.invalid"
    s = storage.factory()()
    assert key not in repr(s)


def test_sb_secret_key_sent_only_via_apikey_header_on_every_storage_call(api, repo, storage):
    c, auth, _ = api
    key = FakeStorageServer.SERVICE_KEY
    assert key.startswith("sb_secret_")
    assert upload(c, auth.headers()).status_code == 201  # upload + sign
    repo.insert_error = psycopg.errors.UniqueViolation("dup")
    repo.approved.clear()
    assert upload(c, auth.headers()).status_code == 409  # upload + delete (cleanup)
    methods = sorted({r.method for r in storage.requests})
    assert methods == ["DELETE", "POST"] and len(storage.requests) == 4
    for r in storage.requests:
        assert r.headers["apikey"] == key
        assert "authorization" not in r.headers  # never `Authorization: Bearer <sb_secret_...>`
        assert key not in str(r.url)  # never in URL/query


def test_storage_errors_never_contain_the_key(storage):
    import asyncio

    import httpx

    from app.errors import StorageError
    from app.storage.supabase import SupabaseStorage

    key = FakeStorageServer.SERVICE_KEY

    def boom(request):
        raise httpx.ConnectError(f"failed for {request.url}")

    cfg = StorageConfig(url="https://storage.test.invalid", bucket="sign-references", service_key=key)

    async def run():
        s = SupabaseStorage(cfg, transport=httpx.MockTransport(boom))
        errors = []
        for call in (s.upload("p/r.mp4", b"x", "video/mp4"), s.signed_url("p/r.mp4"), s.delete("p/r.mp4")):
            with pytest.raises(StorageError) as exc:
                await call
            errors.append(exc.value)
        await s.aclose()
        return errors

    for e in asyncio.run(run()):
        assert key not in str(e) and key not in repr(e) and e.__cause__ is None


def test_admin_jwt_is_not_forwarded_to_storage(api, storage):
    c, auth, _ = api
    h = auth.headers()
    assert upload(c, h).status_code == 201
    jwt = h["Authorization"].split()[1]
    assert all(jwt not in str(r.headers) for r in storage.requests)
