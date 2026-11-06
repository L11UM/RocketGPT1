#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ "$#" -gt 1 ]; then
  printf 'Usage: sh scripts/serve_model.sh [adapter-directory]\n' >&2
  exit 2
fi

ADAPTER_PATH=${1:-"$PROJECT_DIR/adapters"}
case "$ADAPTER_PATH" in
  /*) ;;
  *) ADAPTER_PATH="$PROJECT_DIR/$ADAPTER_PATH" ;;
esac

if [ ! -f "$ADAPTER_PATH/adapters.safetensors" ] || [ ! -f "$ADAPTER_PATH/adapter_config.json" ]; then
  printf 'Adapter files were not found in %s\n' "$ADAPTER_PATH" >&2
  exit 1
fi

exec "$PROJECT_DIR/.venv/bin/mlx_lm.server" \
  --model mlx-community/Qwen2.5-1.5B-Instruct-4bit \
  --adapter-path "$ADAPTER_PATH" \
  --host 127.0.0.1 \
  --port 8080