#!/bin/sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PYTHON="$PROJECT_DIR/.venv/bin/python"
MLX_LORA="$PROJECT_DIR/.venv/bin/mlx_lm.lora"
MODEL="mlx-community/Qwen2.5-1.5B-Instruct-4bit"
MIN_TRAIN_EXAMPLES=200
TRAIN_ITERS=${TRAIN_ITERS:-100}

if [ ! -x "$PYTHON" ] || [ ! -x "$MLX_LORA" ]; then
  printf 'MakingGPT environment is missing. Follow the setup steps in README.md first.\n' >&2
  exit 1
fi

cd "$PROJECT_DIR"

"$PYTHON" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)' || {
  printf 'MakingGPT training requires Python 3.11 or newer.\n' >&2
  exit 1
}

case "$TRAIN_ITERS" in
  ''|*[!0-9]*|0)
    printf 'TRAIN_ITERS must be a positive whole number.\n' >&2
    exit 2
    ;;
esac

"$PYTHON" "$PROJECT_DIR/scripts/validate_data.py"
set -- $("$PYTHON" -c 'from pathlib import Path; print(*(sum(1 for line in (Path("data") / f"{name}.jsonl").open(encoding="utf-8") if line.strip()) for name in ("train", "valid", "test")))')
TRAIN_COUNT=$1
VALID_COUNT=$2
TEST_COUNT=$3

if { [ "$TRAIN_COUNT" -lt "$MIN_TRAIN_EXAMPLES" ] || [ "$VALID_COUNT" -lt 20 ] || [ "$TEST_COUNT" -lt 20 ]; } \
  && [ "${ALLOW_SMALL_DATASET:-0}" != "1" ]; then
  printf '\nTraining stopped: the splits contain %s training, %s validation, and %s test examples.\n' \
    "$TRAIN_COUNT" "$VALID_COUNT" "$TEST_COUNT" >&2
  printf 'Aim for at least %s reviewed training and 20 independent examples in each evaluation split.\n' \
    "$MIN_TRAIN_EXAMPLES" >&2
  printf 'The current files are format samples, not a useful training dataset.\n' >&2
  printf 'After reviewing your data, use ALLOW_SMALL_DATASET=1 only for an intentional smoke test.\n' >&2
  exit 2
fi

if [ "$TRAIN_COUNT" -lt "$MIN_TRAIN_EXAMPLES" ] || [ "$VALID_COUNT" -lt 20 ] || [ "$TEST_COUNT" -lt 20 ]; then
  printf 'Warning: proceeding with only %s train, %s validation, and %s test examples; results are not a meaningful quality evaluation.\n' \
    "$TRAIN_COUNT" "$VALID_COUNT" "$TEST_COUNT" >&2
fi

RUN_ID=$(date -u '+%Y%m%dT%H%M%SZ')-$$
ADAPTER_PATH="$PROJECT_DIR/adapters/runs/$RUN_ID"
mkdir -p "$ADAPTER_PATH"
printf 'Experiment output: %s\n' "$ADAPTER_PATH"

printf '\nBaseline test loss (base model, no adapter):\n'
"$MLX_LORA" \
  --model "$MODEL" \
  --data "$PROJECT_DIR/data" \
  --adapter-path "" \
  --test \
  --test-batches -1

printf '\nTraining and measuring held-out test loss:\n'
"$MLX_LORA" \
  --model "$MODEL" \
  --train \
  --test \
  --data "$PROJECT_DIR/data" \
  --adapter-path "$ADAPTER_PATH" \
  --iters "$TRAIN_ITERS" \
  --batch-size 1 \
  --num-layers 4 \
  --mask-prompt \
  --seed 42 \
  --val-batches -1 \
  --test-batches -1

printf '\nTo serve this experiment locally:\nsh scripts/serve_model.sh adapters/runs/%s\n' "$RUN_ID"
