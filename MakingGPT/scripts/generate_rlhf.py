#!/usr/bin/env python3
import argparse
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer


PROJECT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_MODEL = PROJECT_DIR / "checkpoints" / "ppo"


def main():
    parser = argparse.ArgumentParser(description="Generate one local MakingGPT response for review.")
    parser.add_argument("--model", type=Path, default=DEFAULT_MODEL)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--max-new-tokens", type=int, default=200)
    args = parser.parse_args()
    if not args.model.is_dir():
        raise SystemExit(f"Model directory not found: {args.model}")
    if args.max_new_tokens < 1:
        raise SystemExit("--max-new-tokens must be positive.")

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    use_cuda = torch.cuda.is_available()
    use_bf16 = use_cuda and torch.cuda.is_bf16_supported()
    dtype = torch.bfloat16 if use_bf16 else (torch.float16 if use_cuda else torch.float32)
    model = AutoModelForCausalLM.from_pretrained(args.model, torch_dtype=dtype)
    model.eval()
    messages = [{"role": "user", "content": args.prompt}]
    inputs = tokenizer.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        return_tensors="pt",
    ).to(model.device)
    with torch.inference_mode():
        generated = model.generate(
            inputs,
            max_new_tokens=args.max_new_tokens,
            do_sample=True,
            temperature=0.7,
            top_p=0.9,
            pad_token_id=tokenizer.eos_token_id,
        )
    response = tokenizer.decode(generated[0, inputs.shape[1]:], skip_special_tokens=True)
    print(response.strip())


if __name__ == "__main__":
    main()
