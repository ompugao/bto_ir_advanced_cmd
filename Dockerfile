# syntax=docker/dockerfile:1

# --- Stage 1: Build Frontend ---
FROM node:22-alpine AS frontend-builder
WORKDIR /workspace
COPY frontend/ ./frontend/
# vite.config.ts outputs to ../web/static
RUN mkdir -p web/static
WORKDIR /workspace/frontend
RUN --mount=type=cache,target=/root/.npm \
    npm ci
RUN npm run build

# --- Stage 2: Build the IR command-line tool ---
FROM ubuntu:24.04 AS binary-builder
ENV DEBIAN_FRONTEND=noninteractive
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libusb-1.0-0-dev
WORKDIR /workspace
COPY Makefile bto_advanced_USBIR_cmd.c ./
RUN make -j $(nproc) && make install

# --- Stage 3: Final Image ---
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Tokyo

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    libusb-1.0-0 \
    python3 \
    python3-venv \
    tzdata

COPY --from=binary-builder /usr/local/bin/bto_advanced_USBIR_cmd /usr/local/bin/

WORKDIR /app
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install -r requirements.txt

# Copy web application code (most frequently changing layer)
COPY web/ ./web/
COPY --from=frontend-builder /workspace/web/static/ ./web/static/

# Settings live in a mounted directory (see docker-compose.yml)
ENV IR_HUB_DATA_DIR=/app/data

EXPOSE 8000

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
    CMD /opt/venv/bin/python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/status', timeout=4)"

ENTRYPOINT ["/opt/venv/bin/uvicorn", "--factory", "web.main:app_factory", "--host", "0.0.0.0", "--port", "8000"]
