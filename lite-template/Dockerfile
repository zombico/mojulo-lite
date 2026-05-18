# Use official Node.js LTS (Iron) runtime on Debian.
#
# Why not Alpine: onnxruntime-node ships prebuilt native binaries linked
# against glibc, and Alpine uses musl. The artifact would build but crash
# on first import with "Error loading shared library ld-linux-x86-64.so.2".
# Debian slim is ~50MB larger and Just Works for native deps.
#
# No --platform pin: the published GHCR image is built multi-arch
# (linux/amd64 + linux/arm64) so Apple Silicon users get a native pull
# instead of QEMU emulation. better-sqlite3 compiles from source per arch;
# onnxruntime-node ships arm64 prebuilds.
FROM node:20-bookworm-slim

# Build deps for better-sqlite3 (native compile) + ca-certificates so any
# outbound HTTPS the bot does (LLM provider calls) verifies properly.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       make \
       g++ \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install production dependencies first (for better caching).
# A `postinstall` script fetches the multilingual-e5-small q8 ONNX weights
# (~113MB) into ./models/ — see scripts/fetch-embed-model.mjs. The .onnx
# file is gitignored and never committed; bake-time download keeps the
# bot's runtime offline (env.allowRemoteModels = false in helper/embedder-local.js).
COPY package*.json ./
COPY scripts/ ./scripts/
RUN npm ci --only=production

# Documents are runtime-populated from the per-bot volume mount (see
# docker-compose.yml). The directory only needs to exist as a mount target.
# Not COPYing because lite-template/documents/ is gitignored — empty in CI.
RUN mkdir -p ./documents

# Copy the small tokenizer/config files that ship in git (the .onnx weights
# were already fetched by postinstall above). Idempotent overlay.
COPY models/ ./models/

# Copy helper functions
COPY helper/ ./helper/

# Copy middleware
COPY middleware/ ./middleware/

# Copy application code
COPY server.js .

# Copy client-side files
COPY client/ ./client/

# Create necessary directories
# These will be populated at runtime via control plane
# RUN mkdir -p documents config

# Copy config template (will be overridden at runtime)
COPY config/ ./config/

# Set environment variables
ENV PORT=3000
ENV NODE_ENV=production
ENV DOCKER_RUN=true

# Expose the application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run the application
CMD ["node", "server.js"]
