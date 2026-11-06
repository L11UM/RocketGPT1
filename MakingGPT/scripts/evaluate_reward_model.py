#!/usr/bin/env python3
import argparse
from pathlib import Path

import torch
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from validate_preferences import validate_preferences


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR / "data"
DEFAULT_REWARD_MODEL = PROJECT_DIR / "checkpoints" / "reward"


def _score(model, tokenizer, messages, answer, max_length):
    conversation = [*messages, {"role": "assistant", "content": answer}]
    text = tokenizer.apply_chat_template(
        conversation,
        tokenize=False,
        add_generation_prompt=False,
    )
    inputs = tokenizer(
        text,
        return_tensors="pt",
        truncation=True,
        max_length=max_length,
    )
    inputs = {name: value.to(model.device) for name, value in inputs.items()}
    with torch.inference_mode():
        return model(**inputs).logits.squeeze().float().item()


def main():
    parser = argparse.ArgumentParser(description="Evaluate reward-model preferences on held-out comparisons.")
    parser.add_argument("--reward-model", type=Path, default=DEFAULT_REWARD_MODEL)
    parser.add_argument("--max-length", type=int, default=1024)
    args = parser.parse_args()
    if not args.reward_model.is_dir():
        raise SystemExit(f"Reward model directory not found: {args.reward_model}")

    splits = validate_preferences(DATA_DIR)
    rows = splits["test"]
    tokenizer = AutoTokenizer.from_pretrained(args.reward_model)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.reward_model,
        num_labels=1,
        torch_dtype=torch.bfloat16
        if torch.cuda.is_available() and torch.cuda.is_bf16_supported()
        else torch.float16
        if torch.cuda.is_available()
        else torch.float32,
    )
    model.eval()

    wins = 0
    ties = 0
    for row in rows:
        chosen_score = _score(model, tokenizer, row["messages"], row["chosen"], args.max_length)
        rejected_score = _score(model, tokenizer, row["messages"], row["rejected"], args.max_length)
        if chosen_score > rejected_score:
            wins += 1
        elif chosen_score == rejected_score:
            ties += 1

    count = len(rows)
    print(f"Held-out preference pairs: {count}")
    print(f"Preferred-answer accuracy: {wins / count:.1%}")
    print(f"Ties: {ties}")
    print("This score measures agreement with these rankings only; it is not a general quality or safety score.")


if __name__ == "__main__":
    main()
