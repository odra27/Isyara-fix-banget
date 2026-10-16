# Landing page (Frontend/landing page) untuk Railway: build Vite → file statis disajikan Caddy.
# Service variable Railway: RAILWAY_DOCKERFILE_PATH=deploy/landing.Dockerfile
FROM node:24-slim AS build
WORKDIR /app

ARG VITE_KIOSK_URL
ARG VITE_LOGIN_URL

COPY ["Frontend/landing page/package.json", "Frontend/landing page/package-lock.json", "landing/"]
RUN cd landing && npm ci
COPY ["Frontend/landing page", "landing"]
RUN cd landing && npm run build

FROM caddy:2-alpine
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/landing/dist /srv
