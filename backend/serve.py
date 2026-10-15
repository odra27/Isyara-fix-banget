"""Dev server launcher (dipakai run-dev.ps1).

Di Windows uvicorn memakai ProactorEventLoop bila dijalankan tanpa --reload, sedangkan psycopg
async hanya bisa jalan di SelectorEventLoop (tanpa ini semua endpoint yang menyentuh database
menjawab 500). Launcher ini menjalankan server di SelectorEventLoop secara eksplisit.

    python serve.py [--host 127.0.0.1] [--port 8000]
"""
from __future__ import annotations

import argparse
import asyncio
import sys

import uvicorn


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    server = uvicorn.Server(uvicorn.Config("app.main:app", host=a.host, port=a.port, loop="none"))
    if sys.platform == "win32":
        asyncio.run(server.serve(), loop_factory=asyncio.SelectorEventLoop)
    else:
        asyncio.run(server.serve())


if __name__ == "__main__":
    main()
