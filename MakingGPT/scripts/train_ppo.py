#!/usr/bin/env python3
import argparse
import os
import sys
from pathlib import Path

from datasets import Dataset
from transformers import AutoModelForCausalLM, AutoModelForSequenceClassification, AutoTokenizer
from trl import PPOv2Config, PPOv2Trainer


PROJECT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_DIR / "data"
DEFAULT_SFT_MODEL = PROJECT_DIR / "checkpoints" / "sft"
DEFAULT_REWARD_MODEL = PROJECT_DIR / "checkpoints" / "reward"
MIN_TRAIN_PREFERENCES = 1000
MIN_EVAL_PREFERENCES = 100


def main():
    parser = argparse.ArgumentParser(description="PPO-align the SFT model against the human-trained reward model.")
    parser.add_argument("--sft-model", type=Path, default=DEFAULT_SFT_MODEL)
    parser.add_argument("--reward-model", type=Path, default=DEFAULT_REWARD_MODEL)
    parser.add_argument("--output-dir", type=Path, default=PROJECT_DIR / "checkpoints" / "ppo")
    parser.add_argument("--epochs", type=int, default=1)
    parser.add_argument("--response-length", type=int, default=128)
    args = parser.parse_args()
    for name, path in (("SFT", args.sft_model), ("reward", args.reward_model)):
        if not path.is_dir():
            raise SystemExit(f"{name} checkpoint not found: {path}")
    if args.epochs < 1 or args.response_length < 1:
        raise SystemExit("--epochs and --response-length must be positive.")
    if not os.environ.get("ALLOW_SMALL_DATASET") == "1":
        from train_reward_model import _check_data
        examples = _check_data()
    else:
        from validate_preferences import validate_preferences
        examples = validate_preferences(DATA_DIR)

    try:
        import torch
    except ImportError as error:
        raise SystemExit("Install requirements-rlhf.txt before starting PPO training.") from error
    if not torch.cuda.is_available():
        raise SystemExit(
            "PPO training requires a CUDA-capable GPU in this workflow because it loads policy, "
            "reference, reward, and value models together. Use a supported GPU runtime."
        )
    use_bf16 = torch.cuda.is_bf16_supported()
    dtype = torch.bfloat16 if use_bf16 else torch.float16

    tokenizer = AutoTokenizer.from_pretrained(args.sft_model, padding_side="left")
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
    tokenizer.padding_side = "left"

    def prepare_prompts(rows):
        prepared = []
        for row in rows:
            input_ids = tokenizer.apply_chat_template(
                row["messages"],
                tokenize=True,
                add_generation_prompt=True,
            )
            if len(input_ids) <= 512:
                prepared.append({"input_ids": input_ids, "lengths": len(input_ids)})
        if not prepared:
            raise ValueError("No preference prompts fit within the 512-token PPO context limit.")
        return Dataset.from_list(prepared)

    train_dataset = prepare_prompts(examples["train"])
    eval_dataset = prepare_prompts(examples["valid"])
    episodes = len(train_dataset) * args.epochs
    config = PPOv2Config(
        output_dir=str(args.output_dir),
        sft_model_path=str(args.sft_model),
        reward_model_path=str(args.reward_model),
        learning_rate=1e-6,
        per_device_train_batch_size=1,
        per_device_eval_batch_size=1,
        gradient_accumulation_steps=1,
        num_mini_batches=1,
        num_ppo_epochs=1,
        num_train_epochs=1,
        total_episodes=episodes,
        local_rollout_forward_batch_size=1,
        response_length=args.response_length,
        temperature=0.7,
        kl_coef=0.05,
        num_sample_generations=0,
        save_strategy="no",
        report_to="none",
        seed=42,
        gradient_checkpointing=True,
        bf16=use_bf16,
        fp16=not use_bf16,
    )
    policy = AutoModelForCausalLM.from_pretrained(args.sft_model, torch_dtype=dtype)
    ref_policy = AutoModelForCausalLM.from_pretrained(args.sft_model, torch_dtype=dtype)
    reward_model = AutoModelForSequenceClassification.from_pretrained(
        args.reward_model, num_labels=1, torch_dtype=dtype
    )
    value_model = AutoModelForSequenceClassification.from_pretrained(
        args.reward_model, num_labels=1, torch_dtype=dtype
    )
    for model in (policy, ref_policy, reward_model, value_model):
        model.config.pad_token_id = tokenizer.pad_token_id

    trainer = PPOv2Trainer(
        config=config,
        tokenizer=tokenizer,
        policy=policy,
        ref_policy=ref_policy,
        reward_model=reward_model,
        value_model=value_model,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
    )
    trainer.train()
    trainer.save_model(str(args.output_dir))
    tokenizer.save_pretrained(args.output_dir)
    print(f"PPO-aligned model saved to {args.output_dir}")
    print("The held-out preference test split was not used by PPO.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
