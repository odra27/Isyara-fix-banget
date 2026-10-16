# Standalone ML Service untuk ISYARA BISINDO
# Railway: Set Root Directory = ml (atau biarkan default jika Dockerfile Path = ml/Dockerfile)
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
COPY pyproject.toml .
COPY src ./src
COPY config ./config
COPY artifacts ./artifacts
COPY serve.py .

# Install package bisindo secara lokal
RUN pip install --no-deps -e .

# Test load model saat build agar memastikan tidak ada missing files
RUN python -c "from bisindo.predict import Predictor; print('Loaded model version:', Predictor().version)"

EXPOSE 8000

# Railway otomatis mengisi $PORT saat runtime
CMD ["sh", "-c", "python serve.py --host 0.0.0.0 --port ${PORT:-8000}"]
