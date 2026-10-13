"""GET /api/phrases (PRD-BE §4.4). Fake DB; no Modeling dependency."""
import psycopg

from app.db.phrases import ActivePhrase
from app.errors import ModelingUnavailable
from tests.api_support import FakeDb, client_for
from tests.fixtures import LABEL_05_UUID, LABEL_06_UUID

URL = "/api/phrases"


class FakeActivePhrases:
    def __init__(self, rows=None, fail=None):
        self.rows = rows if rows is not None else []
        self.fail = fail
        self.calls = 0

    async def list_active(self):
        self.calls += 1
        if self.fail:
            raise self.fail
        return self.rows


def get(phrases, **kw):
    db = FakeDb(phrases=phrases)
    c, p, _ = client_for(db=db, **kw)
    with c:
        r = c.get(URL)
    return r, db, p


def test_returns_exactly_prd_fields():
    rows = [ActivePhrase(LABEL_05_UUID, "Lagi", "Fallback"), ActivePhrase(LABEL_06_UUID, "Maaf", "Fallback")]
    r, db, p = get(FakeActivePhrases(rows))
    assert r.status_code == 200
    assert r.json() == [
        {"id": str(LABEL_05_UUID), "phrase_text": "Lagi", "category": "Fallback"},
        {"id": str(LABEL_06_UUID), "phrase_text": "Maaf", "category": "Fallback"},
    ]
    assert all(set(item) == {"id", "phrase_text", "category"} for item in r.json())
    assert db.opened == db.closed == 1 and p.payloads == []


def test_empty_vocabulary_is_empty_list():
    r, _, _ = get(FakeActivePhrases([]))
    assert r.status_code == 200 and r.json() == []


def test_database_error_is_500_envelope_without_details():
    r, _, _ = get(FakeActivePhrases(fail=psycopg.OperationalError("host=db-secret password=x")))
    assert r.status_code == 500
    assert r.json() == {"error": {"code": "INTERNAL_ERROR", "message": "Internal server error"}}
    assert "db-secret" not in r.text


def test_works_without_modeling():
    def boom():
        raise ModelingUnavailable("x")

    r, _, _ = get(FakeActivePhrases([ActivePhrase(LABEL_05_UUID, "Lagi", "Fallback")]), modeling_factory=boom)
    assert r.status_code == 200 and len(r.json()) == 1


def test_read_only_methods():
    c, _, _ = client_for(db=FakeDb(phrases=FakeActivePhrases()))
    with c:
        for m in ("post", "put", "patch", "delete"):
            assert getattr(c, m)(URL).status_code == 405


def test_admin_endpoints_are_not_public():
    # Admin endpoints exist since Phase 5B; without a JWT they must answer 401 (ADR-039).
    c, _, _ = client_for()
    with c:
        assert c.get("/api/admin/phrases").status_code == 401
        assert c.get("/api/admin/logs").status_code == 401
        assert c.get("/api/admin/devices").status_code == 401
        assert c.post("/api/admin/phrases", json={}).status_code == 401
