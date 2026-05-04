# syntax=docker/dockerfile:1
FROM ubuntu:24.04

# Set environment variables to non-interactive and timezone
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Asia/Tokyo

# Install system dependencies
# These layers use cache mounts for apt to speed up repeated builds
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libusb-1.0-0-dev \
    python3 \
    python3-pip \
    python3-venv \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

# Build C binary
# Cached as long as C source or Makefile don't change
WORKDIR /workspace
COPY Makefile bto_advanced_USBIR_cmd.c ./
RUN make -j $(nproc) && make install && make clean

# Setup Python environment
# Uses a cache mount for pip to avoid re-downloading packages
WORKDIR /app
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install -r requirements.txt

# Copy web application code
# This is usually the layer that changes most often
COPY web/ ./web/

# Expose FastAPI port
EXPOSE 8000

# Start the application using the venv
ENTRYPOINT ["/opt/venv/bin/uvicorn", "web.main:app", "--host", "0.0.0.0", "--port", "8000"]
