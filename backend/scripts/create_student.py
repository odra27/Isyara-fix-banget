"""Daftarkan akun siswa (ADR-051 D2) — dipakai sekolah / operator sampai ada endpoint admin.

    cd backend && set -a && source .env && set +a
    .venv/bin/python scripts/create_student.py --nis 0012345678 --name "Nadia Putri" \
        --class 5A --grade 5 --school "SLB Negeri Contoh"

Password ditanyakan lewat prompt (tidak muncul di layar / riwayat shell). Bisa juga lewat env
STUDENT_PASSWORD untuk otomatisasi.

Langkah:
  1. Sekolah dicari berdasarkan nama di `institutions`; dibuat bila belum ada.
  2. User Supabase Auth dibuat lewat Admin API (SUPABASE_SERVICE_ROLE_KEY) dengan email sintetis
     `<nis>@siswa.isyara.local`, `email_confirm = true`, `app_metadata.role = "siswa"`.
  3. Baris `student_profiles` ditulis. Bila langkah 3 gagal, user Auth dari langkah 2 dihapus lagi
     supaya tidak ada akun yatim.
Siswa login cukup dengan NIS + password; email sintetis tidak pernah ditampilkan.
"""
from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402

from app.errors import Conflict  # noqa: E402
from app.provisioning.supabase_admin import SupabaseAdminClient, WeakPassword  # noqa: E402

EMAIL_DOMAIN = "siswa.isyara.local"


def parse() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Daftarkan akun siswa (NIS + password).")
    p.add_argument("--nis", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--class", dest="class_name")
    p.add_argument("--grade", type=int, choices=range(1, 13), metavar="1-12")
    p.add_argument("--school", required=True, help="nama sekolah (institutions.name)")
    return p.parse_args()


async def main() -> int:
    a = parse()
    nis = a.nis.strip()
    if not nis or len(nis) > 30:
        print("NIS wajib diisi, maksimal 30 karakter.", file=sys.stderr)
        return 2
    password = os.environ.get("STUDENT_PASSWORD") or getpass.getpass("Password siswa (min. 6 karakter): ")
    if len(password) < 6:
        print("Password minimal 6 karakter.", file=sys.stderr)
        return 2

    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("DATABASE_URL belum di-set (muat backend/.env dulu).", file=sys.stderr)
        return 2

    with psycopg.connect(dsn, autocommit=True, prepare_threshold=None) as conn:
        if conn.execute("select to_regclass('student_profiles')").fetchone()[0] is None:
            print("Tabel student_profiles belum ada. Jalankan migration ADR-051 dulu.", file=sys.stderr)
            return 2
        if conn.execute("select 1 from student_profiles where nis = %s", (nis,)).fetchone():
            print(f"NIS {nis} sudah terdaftar.", file=sys.stderr)
            return 1
        row = conn.execute("select id from institutions where name = %s limit 1", (a.school,)).fetchone()
        school_id = row[0] if row else conn.execute(
            "insert into institutions (name) values (%s) returning id", (a.school,)
        ).fetchone()[0]

        admin = SupabaseAdminClient.from_env()
        try:
            try:
                user_id = await admin.create_user(email=f"{nis.lower()}@{EMAIL_DOMAIN}", password=password, role="siswa")
            except Conflict:
                print("Akun Auth untuk NIS ini sudah ada di Supabase (tanpa profil). Hapus dulu di dashboard.", file=sys.stderr)
                return 1
            except WeakPassword:
                print("Password ditolak kebijakan password Supabase. Pakai password yang lebih kuat.", file=sys.stderr)
                return 1
            try:
                conn.execute(
                    "insert into student_profiles (id, institution_id, nis, full_name, class_name, grade)"
                    " values (%s, %s, %s, %s, %s, %s)",
                    (user_id, school_id, nis, a.name.strip(), a.class_name, a.grade),
                )
            except Exception:
                await admin.delete_user(user_id)  # rollback: jangan tinggalkan akun tanpa profil
                raise
        finally:
            await admin.aclose()

    print(f"OK: siswa {a.name} (NIS {nis}) terdaftar di {a.school}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
