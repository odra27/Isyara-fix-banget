# Aplikasi siswa (Frontend/main) untuk Railway: build Vite → file statis disajikan Caddy.
# Service variable Railway: RAILWAY_DOCKERFILE_PATH=deploy/app.Dockerfile
# Variabel VITE_* dibaca saat BUILD (Railway meneruskan service variable sebagai build arg).
FROM node:24-slim AS build
WORKDIR /app

ARG VITE_API_BASE_URL
ARG VITE_LANDING_URL
ARG VITE_DEVICE_ID
ARG VITE_DEMO_NIS
ARG VITE_DEMO_PASSWORD

# Model MediaPipe (.task) disalin ke public/ oleh scripts/copy-mediapipe.mjs saat build.
COPY ml/mp_models ml/mp_models
COPY Frontend/main/package.json Frontend/main/package-lock.json Frontend/main/
RUN cd Frontend/main && npm ci
COPY Frontend/main Frontend/main
RUN cd Frontend/main && npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/Frontend/main/dist /srv