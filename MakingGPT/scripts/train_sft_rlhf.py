#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer
import torch


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR / "data"
DEFAULT_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"


def read_jsonl(path):
    with path.open(encoding="utf-8") as data_file:
        return [json.loads(line) for line in data_file if line.strip()]


def _check_data():
    from validate_data import MIN_EVAL_EXAMPLES, MIN_TRAIN_EXAMPLES, validate_dataset

    splits = validate_dataset(DATA_DIR)
    allow_small = os.environ.get("ALLOW_SMALL_DATASET") == "1"
    if (
        len(splits["train"]) < MIN_TRAIN_EXAMPLES
        or len(splits["valid"]) < MIN_EVAL_EXAMPLES
        or len(splits["test"]) < MIN_EVAL_EXAMPLES
    ) and not allow_small:
        raise SystemExit(
            "SFT stopped: add reviewed examples to meet the thresholds in validate_data.py. "
            "ALLOW_SMALL_DATASET=1 is only for a smoke test, not quality claims."
        )
    return splits


def main():
    parser = argparse.ArgumentParser(description="Supervised fine-tune the MakingGPT policy model.")
    parser.add_argument("--model", default=os.environ.get("BASE_MODEL", DEFAULT_MODEL))
    parser.add_argument("--output-dir", type=Path, default=PROJECT_DIR / "checkpoints" / "sft")
    parser.add_argument("--epochs", type=float, default=3)
    parser.add_argument("--max-length", type=int, default=1024)
    args = parser.parse_args()
    if args.epochs <= 0 or args.max_length < 64:
        raise SystemExit("--epochs must be positive and --max-length must be at least 64.")

    _check_data()
    tokenizer = AutoTokenizer.from_pretrained(args.model)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    def format_split(split):
        examples = read_jsonl(DATA_DIR / f"{split}.jsonl")
        texts = [
            tokenizer.apply_chat_template(
                example["messages"],
                tokenize=False,
                add_generation_prompt=False,
            )
            for example in examples
        ]
        return Dataset.from_dict({"text": texts})

    use_cuda = torch.cuda.is_available()
    use_bf16 = use_cuda and torch.cuda.is_bf16_supported()
    dtype = torch.bfloat16 if use_bf16 else (torch.float16 if use_cuda else torch.float32)
    model = AutoModelForCausalLM.from_pretrained(args.model, torch_dtype=dtype)
    model.config.pad_token_id = tokenizer.pad_token_id
    training_args = SFTConfig(
        output_dir=str(args.output_dir),
        learning_rate=2e-5,
        num_train_epochs=args.epochs,
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
        max_seq_length=args.max_length,
        dataset_text_field="text",
        packing=False,
    )
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=format_split("train"),
        eval_dataset=format_split("valid"),
        tokenizer=tokenizer,
    )
    trainer.train()
    trainer.save_model(str(args.output_dir))
    tokenizer.save_pretrained(args.output_dir)
    print(f"SFT checkpoint saved to {args.output_dir}")


if __name__ == "__main__":
    main()
