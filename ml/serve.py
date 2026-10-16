"""Standalone HTTP API for ISYARA BISINDO Sign Language Modeling.

Usage:
    python serve.py [--host 0.0.0.0] [--port 8000]

Endpoints:
    GET  /health      -> Healthcheck & model version
    GET  /vocabulary  -> List of recognized BISINDO phrases
    POST /predict     -> Input landmark sequence, output predicted sign phrase
"""
from __future__ import annotations

import argparse
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

# Pastikan folder ml/src ada di PYTHONPATH agar bisindo bisa diimpor langsung
ML_DIR = Path(__file__).resolve().parent
SRC_DIR = ML_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError
import uvicorn

from bisindo.predict import Predictor
from bisindo.schema import Sequence

predictor: Predictor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor
    try:
        print("[ISYARA-ML] Loading ONNX model and artifacts...")
        predictor = Predictor(artifacts_dir=ML_DIR / "artifacts")
        print(f"[ISYARA-ML] Model loaded successfully! Version: {predictor.version}, Classes: {predictor.K}")
    except Exception as e:
        print(f"[ISYARA-ML] ERROR: Failed to load model: {e}", file=sys.stderr)
        predictor = None
    yield


app = FastAPI(
    title="ISYARA BISINDO ML Service",
    description="Standalone API service for BISINDO sign language sequence classification",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def index():
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model is loading or unavailable")
    return {
        "service": "isyara-ml",
        "status": "ready",
        "version": predictor.version,
        "classes_count": predictor.K,
        "docs": "/docs",
    }


@app.get("/health")
def health():
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model unavailable")
    return {
        "status": "ok",
        "version": predictor.version,
        "known_classes": predictor.K,
    }


@app.get("/vocabulary")
def vocabulary():
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model unavailable")
    return {
        "count": len(predictor.labels),
        "vocabulary": predictor.vocabulary(),
    }


@app.post("/predict")
def predict(payload: Sequence):
    """Predict BISINDO sign language phrase from landmark sequence."""
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model unavailable")

    try:
        result = predictor.predict_sequence(payload)
        return result
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")


def main():
    parser = argparse.ArgumentParser(description="Run ISYARA ML Standalone Server")
    parser.add_argument("--host", default=os.environ.get("HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    args = parser.parse_args()

    print(f"[ISYARA-ML] Starting server at http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
