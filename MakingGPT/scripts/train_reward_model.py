#!/usr/bin/env python3
import argparse
import os
import sys
from pathlib import Path

from datasets import Dataset
from transformers import AutoModelForSequenceClassification, AutoTokenizer
from trl import RewardConfig, RewardTrainer
import torch


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR / "data"
DEFAULT_SFT_MODEL = PROJECT_DIR / "checkpoints" / "sft"
MIN_TRAIN_PREFERENCES = 1000
MIN_EVAL_PREFERENCES = 100


def _check_data():
    from validate_preferences import validate_preferences

    examples = validate_preferences(DATA_DIR)
    allow_small = os.environ.get("ALLOW_SMALL_DATASET") == "1"
    if (
        len(examples["train"]) < MIN_TRAIN_PREFERENCES
        or len(examples["valid"]) < MIN_EVAL_PREFERENCES
        or len(examples["test"]) < MIN_EVAL_PREFERENCES
    ) and not allow_small:
        raise SystemExit(
            "Reward-model training stopped: add reviewed preference pairs to meet the documented "
            "minimums. ALLOW_SMALL_DATASET=1 is only for a smoke test."
        )
    return examples


def _tokenize_pair(tokenizer, messages, answer, max_length):
    conversation = [*messages, {"role": "assistant", "content": answer}]
    ids = tokenizer.apply_chat_template(
        conversation,
        tokenize=True,
        add_generation_prompt=False,
        truncation=True,
        max_length=max_length,
    )
    return ids, [1] * len(ids)


def _to_dataset(rows, tokenizer, max_length):
    tokenized = []
    for row in rows:
        chosen_ids, chosen_mask = _tokenize_pair(
            tokenizer, row["messages"], row["chosen"], max_length
        )
        rejected_ids, rejected_mask = _tokenize_pair(
            tokenizer, row["messages"], row["rejected"], max_length
        )
        tokenized.append({
            "input_ids_chosen": chosen_ids,
            "attention_mask_chosen": chosen_mask,
            "input_ids_rejected": rejected_ids,
            "attention_mask_rejected": rejected_mask,
        })
    return Dataset.from_list(tokenized)


def main():
    parser = argparse.ArgumentParser(description="Train a scalar reward model from human rankings.")
    parser.add_argument("--sft-model", type=Path, default=DEFAULT_SFT_MODEL)
    parser.add_argument("--output-dir", type=Path, default=PROJECT_DIR / "checkpoints" / "reward")
    parser.add_argument("--max-length", type=int, default=1024)
    args = parser.parse_args()
    if not args.sft_model.is_dir():
        raise SystemExit(f"SFT model directory not found: {args.sft_model}")
    if args.max_length < 64:
        raise SystemExit("--max-length must be at least 64.")

    examples = _check_data()
    tokenizer = AutoTokenizer.from_pretrained(args.sft_model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    use_cuda = torch.cuda.is_available()
    use_bf16 = use_cuda and torch.cuda.is_bf16_supported()
    dtype = torch.bfloat16 if use_bf16 else (torch.float16 if use_cuda else torch.float32)
    model = AutoModelForSequenceClassification.from_pretrained(
        args.sft_model,
        num_labels=1,
        ignore_mismatched_sizes=True,
        torch_dtype=dtype,
    )
    model.config.pad_token_id = tokenizer.pad_token_id
    training_args = RewardConfig(
        output_dir=str(args.output_dir),
        learning_rate=1e-5,
        num_train_epochs=1,
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=8,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",
        greater_is_better=False,
        logging_steps=10,
        report_to="none",
        seed=42,
        bf16=use_bf16,
        fp16=use_cuda and not use_bf16,
        gradient_checkpointing=True,
        max_length=args.max_length,
        center_rewards_coefficient=0.01,
    )
    trainer = RewardTrainer(
        model=model,
        args=training_args,
        tokenizer=tokenizer,
        train_dataset=_to_dataset(examples["train"], tokenizer, args.max_length),
        eval_dataset=_to_dataset(examples["valid"], tokenizer, args.max_length),
    )
    trainer.train()
    trainer.save_model(str(args.output_dir))
    tokenizer.save_pretrained(args.output_dir)
    print(f"Reward model saved to {args.output_dir}")
    print("Held-out preference test data was not used for training or model selection.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
