#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PYTHON="$PROJECT_DIR/.venv/bin/python"
MLX_SERVER="$PROJECT_DIR/.venv/bin/mlx_lm.server"
MODEL="mlx-community/Qwen2.5-1.5B-Instruct-4bit"
ADAPTER_PATH=${ADAPTER_PATH:-"$PROJECT_DIR/adapters"}
MODEL_PORT=${MODEL_PORT:-8080}
WEB_PORT=${WEB_PORT:-3000}

case "$ADAPTER_PATH" in
  /*) ;;
  *) ADAPTER_PATH="$PROJECT_DIR/$ADAPTER_PATH" ;;
esac

if [ ! -x "$PYTHON" ] || [ ! -x "$MLX_SERVER" ]; then
  printf 'MakingGPT environment is missing. Follow the setup steps in README.md first.\n' >&2
  exit 1
fi

if [ ! -f "$ADAPTER_PATH/adapters.safetensors" ] || [ ! -f "$ADAPTER_PATH/adapter_config.json" ]; then
  printf 'The MakingGPT adapter was not found in %s\n' "$ADAPTER_PATH" >&2
  exit 1
fi

"$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' || {
  printf 'MakingGPT requires Python 3.11 or newer.\n' >&2
  exit 1
}

validate_port() {
  "$PYTHON" - "$1" <<'PY'
import sys
try:
    port = int(sys.argv[1])
except ValueError:
    raise SystemExit(1)
raise SystemExit(0 if 1024 <= port <= 65535 else 1)
PY
}

port_is_available() {
  "$PYTHON" - "$1" <<'PY'
import socket
import sys
with socket.socket() as sock:
    try:
        sock.bind(("127.0.0.1", int(sys.argv[1])))
    except OSError:
        raise SystemExit(1)
PY
}

existing_model_server_matches() {
  command -v lsof >/dev/null 2>&1 || return 1
  existing_pid=$(lsof -nP -t -iTCP:"$MODEL_PORT" -sTCP:LISTEN | head -n 1)
  [ -n "$existing_pid" ] || return 1
  existing_command=$(ps -p "$existing_pid" -o command=) || return 1
  printf '%s\n' "$existing_command" | grep -F 'mlx_lm.server' >/dev/null \
    && printf '%s\n' "$existing_command" | grep -F "$MODEL" >/dev/null \
    && printf '%s\n' "$existing_command" | grep -F "$ADAPTER_PATH" >/dev/null
}

if ! validate_port "$MODEL_PORT" || ! validate_port "$WEB_PORT"; then
  printf 'MODEL_PORT and WEB_PORT must be whole numbers from 1024 to 65535.\n' >&2
  exit 2
fi

if ! port_is_available "$WEB_PORT"; then
  printf 'Preview port %s is already in use. Set WEB_PORT to another available port and retry.\n' "$WEB_PORT" >&2
  exit 1
fi

MODEL_PID=
WEB_PID=
STARTED_MODEL=0

cleanup() {
  if [ -n "$WEB_PID" ]; then
    kill "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
  fi
  if [ "$STARTED_MODEL" = "1" ] && [ -n "$MODEL_PID" ]; then
    kill "$MODEL_PID" 2>/dev/null || true
    wait "$MODEL_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if existing_model_server_matches \
  && curl --silent --fail "http://127.0.0.1:$MODEL_PORT/health" >/dev/null; then
  printf 'Using the existing local MLX server on port %s.\n' "$MODEL_PORT"
else
  if ! port_is_available "$MODEL_PORT"; then
    printf 'Model port %s is in use by a different service. Set MODEL_PORT to another available port and retry.\n' "$MODEL_PORT" >&2
    exit 1
  fi
  "$MLX_SERVER" \
    --model "$MODEL" \
    --adapter-path "$ADAPTER_PATH" \
    --host 127.0.0.1 \
    --port "$MODEL_PORT" \
    --allowed-origins "http://127.0.0.1:$WEB_PORT" &
  MODEL_PID=$!
  STARTED_MODEL=1
  printf 'Starting the local model. The first model load can take a minute.\n'
fi

python3 -m http.server "$WEB_PORT" --bind 127.0.0.1 --directory "$PROJECT_DIR/web" &
WEB_PID=$!

attempt=0
while [ "$attempt" -lt 180 ]; do
  if curl --silent --fail "http://127.0.0.1:$MODEL_PORT/health" >/dev/null; then
    break
  fi
  if [ "$STARTED_MODEL" = "1" ] && ! kill -0 "$MODEL_PID" 2>/dev/null; then
    printf 'The local model server stopped before it became ready. Check its output above.\n' >&2
    exit 1
  fi
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    printf 'The local preview server stopped. Port 3000 may already be in use.\n' >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 1
done

if ! curl --silent --fail "http://127.0.0.1:$MODEL_PORT/health" >/dev/null; then
  printf 'The local model did not become ready within 180 seconds.\n' >&2
  exit 1
fi

printf '\nMakingGPT is ready: http://127.0.0.1:%s/?modelPort=%s\n' "$WEB_PORT" "$MODEL_PORT"
printf 'Press Ctrl+C to stop the preview%s.\n\n' \
  "$(if [ "$STARTED_MODEL" = "1" ]; then printf ' and local model'; else printf ' (the pre-existing model server will stay running)'; fi)"
wait "$WEB_PID"
