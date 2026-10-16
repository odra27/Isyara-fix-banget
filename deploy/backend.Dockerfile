# Backend ISYARA untuk Railway (build context = root repo, karena butuh folder ml/).
# Service variable Railway: RAILWAY_DOCKERFILE_PATH=deploy/backend.Dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Runtime library model saja (tanpa torch/mediapipe), versi sama dengan ml/requirements.txt.
RUN pip install numpy==2.2.6 onnxruntime==1.23.2 scikit-learn==1.7.2 pyyaml==6.0.3 matplotlib==3.10.6

# Library model (editable: Predictor mencari ml/artifacts lewat layout repo).
COPY ml/pyproject.toml ml/pyproject.toml
COPY ml/src ml/src
COPY ml/config ml/config
COPY ml/artifacts ml/artifacts
RUN pip install --no-deps -e ./ml

# Backend: pasang dependency dari backend/pyproject.toml (versi terkunci), lalu salin kode.
COPY backend/pyproject.toml backend/pyproject.toml
RUN python -c "import tomllib, subprocess, sys; deps = tomllib.load(open('backend/pyproject.toml', 'rb'))['project']['dependencies']; subprocess.check_call([sys.executable, '-m', 'pip', 'install', *deps])"
COPY backend/app backend/app
COPY backend/serve.py backend/serve.py

WORKDIR /app/backend
# Gagal build di sini lebih baik daripada gagal saat start.
RUN python -c "import bisindo.predict, app.main; from bisindo.predict import Predictor; print('model', Predictor().version)"
EXPOSE 8000
# Railway mengisi $PORT. Model isyarat dimuat ~30 detik saat start.
CMD ["sh", "-c", "python serve.py --host 0.0.0.0 --port ${PORT:-8000}"]
