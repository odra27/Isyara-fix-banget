"""Jalankan file migration yang belum diterapkan (dev / operator).

    cd backend && set -a && source .env && set +a
    .venv/bin/python scripts/apply_migrations.py            # tampilkan status saja
    .venv/bin/python scripts/apply_migrations.py --apply    # jalankan yang belum

Tidak ada tabel riwayat migration di project ini, jadi status dicek dari objek yang dibuat
tiap file (lihat CHECKS). Setiap file dijalankan dalam satu transaksi. Hanya file yang
idempoten/non-destruktif yang boleh ditambahkan ke CHECKS.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

import psycopg

MIGRATIONS = Path(__file__).resolve().parents[2] / "Database" / "migrations"

# file → query yang bernilai true bila migration sudah diterapkan
CHECKS: dict[str, str] = {
    "20261006000000_adr049_seed_43_label_vocabulary.sql": "select exists (select 1 from phrases where model_phrase_id = 'label_42')",
    "20261013000000_adr051_student_chat_schema.sql": "select to_regclass('chat_messages') is not null",
    "20261014000000_adr053_chat_video_context_documents.sql": "select to_regclass('chat_documents') is not null",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    a = ap.parse_args()
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL belum di-set (muat backend/.env dulu).", file=sys.stderr)
        return 2
    with psycopg.connect(dsn, prepare_threshold=None) as conn:
        for name, check in CHECKS.items():
            done = conn.execute(check).fetchone()[0]
            conn.rollback()
            if done:
                print(f"sudah   {name}")
                continue
            if not a.apply:
                print(f"BELUM   {name}")
                continue
            with conn.transaction():
                conn.execute((MIGRATIONS / name).read_text(encoding="utf-8"))
            print(f"diterapkan {name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
