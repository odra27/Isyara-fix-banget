# Standalone ML Service untuk ISYARA BISINDO (Build context: Root Repo)
# Service variable Railway: RAILWAY_DOCKERFILE_PATH=deploy/ml.Dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Dependencies inferensi model + FastAPI server
RUN pip install \
    numpy==2.2.6 \
    onnxruntime==1.23.2 \
    scikit-learn==1.7.2 \
    pyyaml==6.0.3 \
    "pydantic>=2.0" \
    "fastapi>=0.110.0" \
    "uvicorn>=0.28.0"

# Salin kode dan artefak model
COPY ml/pyproject.toml ml/pyproject.toml
COPY ml/src ml/src
COPY ml/config ml/config
COPY ml/artifacts ml/artifacts
COPY ml/serve.py ml/serve.py

WORKDIR /app/ml

# Install package bisindo secara lokal
RUN pip install --no-deps -e .

# Test load model saat build
RUN python -c "from bisindo.predict import Predictor; print('Loaded model version:', Predictor().version)"

EXPOSE 8000

# Railway otomatis mengisi $PORT saat runtime
CMD ["sh", "-c", "python serve.py --host 0.0.0.0 --port ${PORT:-8000}"]
