#!/usr/bin/env bash
# Daily / on-demand Comms Hub redeploy (comms-hub-ops).
# Reads HOST_PORT from .env.local; falls back to 3000 if preferred port fails.
set -euo pipefail

CHECKOUT="${COMMS_HUB_CHECKOUT:-$HOME/git/commsHub}"
cd "$CHECKOUT"

export PATH="/opt/podman/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

LOG_DIR="$CHECKOUT/logs"
mkdir -p "$LOG_DIR"
exec >>"$LOG_DIR/comms-hub-ops.log" 2>>"$LOG_DIR/comms-hub-ops.err"

ts() { date '+%Y-%m-%d %H:%M:%S %Z'; }
echo ""
echo "==== $(ts) comms-hub-ops start ===="

PORT=8082
APP_URL="http://localhost:8082"
if [[ -f .env.local ]]; then
  HP=$(grep -E '^HOST_PORT=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  if [[ -n "${HP:-}" ]]; then
    PORT="$HP"
    APP_URL="http://localhost:${PORT}"
  fi
  URL=$(grep -E '^NEXT_PUBLIC_APP_URL=' .env.local | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  if [[ -n "${URL:-}" ]]; then
    APP_URL="$URL"
  fi
fi

echo "comms-hub-ops: resolving personal port from .env.local… PORT=$PORT APP_URL=$APP_URL"
echo "comms-hub-ops: pulling latest main…"
git pull --ff-only origin main
git log -1 --oneline

echo "comms-hub-ops: stopping existing container (if any)…"
podman rm -f comms-hub 2>/dev/null || true

echo "comms-hub-ops: building image for ${APP_URL}…"
podman build \
  -t localhost/comms-hub:local \
  -f Containerfile \
  --build-arg NEXT_PUBLIC_DEMO_MODE=false \
  --build-arg NEXT_PUBLIC_APP_URL="$APP_URL" \
  .

run_on_port() {
  local host_port="$1"
  local app_url="$2"
  local uid_gid
  uid_gid="$(id -u):$(id -g)"
  echo "comms-hub-ops: starting container on host port ${host_port}…"
  podman run -d \
    --name comms-hub \
    --user "$uid_gid" \
    --userns=keep-id \
    -p "${host_port}:3000" \
    --env-file "$CHECKOUT/.env.local" \
    -e STATUS_REPO_ROOT=/repo \
    -e STATUS_GIT_SYNC=true \
    -e NEXT_PUBLIC_APP_URL="$app_url" \
    -e HOME=/tmp \
    -v "$CHECKOUT":/repo:z \
    localhost/comms-hub:local
  sleep 3
  echo "comms-hub-ops: health-checking http://localhost:${host_port}/…"
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${host_port}/" || echo "000")
  echo "HTTP $code"
  [[ "$code" == "200" ]]
}

if ! run_on_port "$PORT" "$APP_URL"; then
  echo "comms-hub-ops: port ${PORT} failed — falling back to 3000…"
  podman rm -f comms-hub 2>/dev/null || true
  # Rebuild public URL for fallback when needed
  if [[ "$PORT" != "3000" ]]; then
    podman build \
      -t localhost/comms-hub:local \
      -f Containerfile \
      --build-arg NEXT_PUBLIC_DEMO_MODE=false \
      --build-arg NEXT_PUBLIC_APP_URL="http://localhost:3000" \
      .
  fi
  run_on_port 3000 "http://localhost:3000"
  PORT=3000
fi

echo "comms-hub-ops: done — app live at http://localhost:${PORT}"
echo "==== $(ts) comms-hub-ops end ===="
