# Stage 1: Build Next.js static export
FROM node:22-alpine AS frontend
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --no-frozen-lockfile
COPY src/ ./src/
COPY public/ ./public/
COPY next.config.ts tsconfig.json postcss.config.mjs components.json ./
RUN pnpm build

# Stage 2a: Build Go MCP binary
FROM golang:1.25-bookworm AS mcp
WORKDIR /app/mcp
COPY mcp/ ./
RUN go build -o workspace-mcp .

# Stage 2b: Build Rust server binary + codeg-mcp companion
FROM rust:slim-bookworm AS backend
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*
WORKDIR /app/src-tauri
COPY src-tauri/ ./
# codeg-mcp is the stdio MCP companion the runtime injects per session
# (see acp/delegation/companion.rs). It must ship next to codeg-server so
# `locate_codeg_mcp_binary()` finds it via the exe-sibling lookup.
RUN cargo build --release --bin codeg-server --no-default-features \
 && cargo build --release --bin codeg-mcp --no-default-features

# Stage 3: Runtime
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y \
    libsqlite3-0 \
    git \
    openssh-client \
    ca-certificates \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

COPY --from=backend /app/src-tauri/target/release/codeg-server /usr/local/bin/codeg-server
COPY --from=backend /app/src-tauri/target/release/codeg-mcp /usr/local/bin/codeg-mcp
COPY --from=mcp /app/mcp/workspace-mcp /usr/local/bin/workspace-mcp
COPY --from=frontend /app/out /app/web

ENV CODEG_STATIC_DIR=/app/web
ENV CODEG_HOME=/data
ENV CODEG_DATA_DIR=/data
ENV WORKSPACE_DATA=/workspace
ENV CODEG_PORT=3080
ENV CODEG_HOST=0.0.0.0
ENV SHELL=/bin/bash
# Git credentials — mount your ~/.ssh or set GitLab token:
# docker run -v ~/.ssh:/root/.ssh ...

EXPOSE 3080
VOLUME /data
VOLUME /workspace

CMD ["codeg-server"]
