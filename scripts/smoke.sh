#!/usr/bin/env bash
# Tier 1.1h — README install-success smoke test.
#
# Proves the install instructions in the README actually work on a fresh
# clone. The #1 OSS bug category — "I followed the install instructions and
# it didn't run" — is silent to every other test in the suite. This script
# is the only thing that catches it.
#
# Scope:
#   - npm install in both packages exits 0 (this is the OSS pain point)
#   - ONNX model file lands at the expected path
#   - npm run build in control exits 0 (proves Next build works)
#   - Control plane boots and /api/health returns 200
#
# Out of scope:
#   - Booting the lite-template bot directly. The bot requires a built
#     deployment artifact (config/config.json, instructions.txt, etc.)
#     which is a control-plane operation, not a fresh-clone operation.
#     The README path for running a bot is "build a deployment, unzip,
#     docker compose up." That's an integration test, not a smoke test.
#
# Run from the repo root:  bash scripts/smoke.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ---------------------------------------------------------------------------
# Cleanup — kill background processes on exit. Use a trap so an early
# failure doesn't leave a dangling Next server holding port 3001.
# ---------------------------------------------------------------------------
CONTROL_PID=""
cleanup() {
  local code=$?
  if [ -n "$CONTROL_PID" ] && kill -0 "$CONTROL_PID" 2>/dev/null; then
    echo "[smoke] stopping control plane (pid $CONTROL_PID)"
    kill "$CONTROL_PID" 2>/dev/null || true
    wait "$CONTROL_PID" 2>/dev/null || true
  fi
  exit $code
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# 1. Install lite-template. The postinstall fetches ONNX weights (~113MB)
#    into models/. We assert the file exists afterwards — a partial download
#    is a silent failure that breaks RAG much later in the user's lifecycle.
# ---------------------------------------------------------------------------
echo "[smoke] installing lite-template…"
(cd lite-template && npm install)

LITE_MODEL_PATH="lite-template/models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx"
if [ ! -f "$LITE_MODEL_PATH" ]; then
  echo "[smoke] FAIL: expected ONNX model at $LITE_MODEL_PATH (postinstall did not produce it)"
  exit 1
fi
# Sanity-check size — multilingual-e5-small q8 is ~113MB. Reject anything
# under 50MB as a partial download.
LITE_MODEL_SIZE=$(stat -f%z "$LITE_MODEL_PATH" 2>/dev/null || stat -c%s "$LITE_MODEL_PATH")
if [ "$LITE_MODEL_SIZE" -lt 50000000 ]; then
  echo "[smoke] FAIL: ONNX model at $LITE_MODEL_PATH is only $LITE_MODEL_SIZE bytes (expected >50MB)"
  exit 1
fi
echo "[smoke] lite-template install ok (ONNX = ${LITE_MODEL_SIZE} bytes)"

# ---------------------------------------------------------------------------
# 2. Install control plane and verify Next build. The build step exercises
#    the path alias resolution, the env-var defaults, and every page route
#    — if any of those break on a fresh clone, this is where it surfaces.
# ---------------------------------------------------------------------------
echo "[smoke] installing control plane…"
(cd control && [ -f .env ] || cp .env.example .env)
(cd control && npm install)

CONTROL_MODEL_PATH="control/lib/embedder/models/Xenova/multilingual-e5-small/onnx/model_quantized.onnx"
if [ ! -f "$CONTROL_MODEL_PATH" ]; then
  echo "[smoke] FAIL: expected ONNX model at $CONTROL_MODEL_PATH"
  exit 1
fi
echo "[smoke] control install ok"

echo "[smoke] building control plane (next build)…"
(cd control && npm run build)
echo "[smoke] control build ok"

# ---------------------------------------------------------------------------
# 3. Boot the control plane in the background, poll /api/health until it
#    comes up, assert 200. Strict timeout so CI never hangs.
# ---------------------------------------------------------------------------
echo "[smoke] starting control plane (next start, port 3001)…"
(cd control && npm start) >/tmp/mojulo-smoke-control.log 2>&1 &
CONTROL_PID=$!

# Poll up to 60s for the server to accept connections. curl --fail returns
# non-zero on any 4xx/5xx, which is what we want.
deadline=$(( $(date +%s) + 60 ))
until curl --fail --silent --output /dev/null --max-time 2 http://127.0.0.1:3001/api/health; do
  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "[smoke] FAIL: control plane did not respond to /api/health within 60s"
    echo "[smoke] --- last 50 lines of control log ---"
    tail -50 /tmp/mojulo-smoke-control.log || true
    exit 1
  fi
  if ! kill -0 "$CONTROL_PID" 2>/dev/null; then
    echo "[smoke] FAIL: control plane process died during startup"
    tail -50 /tmp/mojulo-smoke-control.log || true
    exit 1
  fi
  sleep 1
done

echo "[smoke] control /api/health responded 200 OK"
echo "[smoke] all checks passed"
