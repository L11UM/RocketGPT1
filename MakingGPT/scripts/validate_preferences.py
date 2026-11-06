#!/usr/bin/env python3
import argparse
import json
import sys
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SPLITS = ("train", "valid", "test")
MIN_TRAIN_PREFERENCES = 1000
MIN_EVAL_PREFERENCES = 100


def _read_split(path):
    examples = []
    seen_prompts = {}
    with path.open(encoding="utf-8") as data_file:
        for line_number, line in enumerate(data_file, start=1):
            location = f"{path}:{line_number}"
            if not line.strip():
                raise ValueError(f"{location}: blank lines are not allowed")
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"{location}: invalid JSON: {error.msg}") from error

            if not isinstance(row, dict):
                raise ValueError(f"{location}: each row must be a JSON object")
            messages = row.get("messages")
            if not isinstance(messages, list) or not messages:
                raise ValueError(f"{location}: expected a non-empty messages array")
            if not isinstance(row.get("chosen"), str) or not row["chosen"].strip():
                raise ValueError(f"{location}: chosen must be non-empty text")
            if not isinstance(row.get("rejected"), str) or not row["rejected"].strip():
                raise ValueError(f"{location}: rejected must be non-empty text")
            if row["chosen"].strip().casefold() == row["rejected"].strip().casefold():
                raise ValueError(f"{location}: chosen and rejected answers must differ")

            normalized = []
            roles = []
            for message in messages:
                if not isinstance(message, dict):
                    raise ValueError(f"{location}: each message must be an object")
                role = message.get("role")
                content = message.get("content")
                if not isinstance(role, str) or role not in {"system", "user", "assistant"}:
                    raise ValueError(f"{location}: unsupported message role {role!r}")
                if not isinstance(content, str) or not content.strip():
                    raise ValueError(f"{location}: message content must be non-empty text")
                roles.append(role)
                normalized.append((role, content.strip().casefold()))

            conversation_roles = roles[1:] if roles[0] == "system" else roles
            if roles.count("system") > 1 or (roles and roles[0] == "system" and len(roles) == 1):
                raise ValueError(f"{location}: system message must appear once before the conversation")
            if not conversation_roles or conversation_roles[0] != "user" or conversation_roles[-1] != "user":
                raise ValueError(f"{location}: prompt must start and end with a user message")
            if any(role != ("user" if index % 2 == 0 else "assistant")
                   for index, role in enumerate(conversation_roles)):
                raise ValueError(f"{location}: prompt messages must alternate user and assistant")

            user_prompt = tuple(content for role, content in normalized if role == "user")
            if user_prompt in seen_prompts:
                raise ValueError(
                    f"{location}: duplicate prompt also appears on line {seen_prompts[user_prompt]}"
                )
            seen_prompts[user_prompt] = line_number
            examples.append({
                "messages": messages,
                "chosen": row["chosen"],
                "rejected": row["rejected"],
                "user_prompt": user_prompt,
            })

    if not examples:
        raise ValueError(f"{path}: no preference examples found")
    return examples


def validate_preferences(data_dir=DATA_DIR):
    data_dir = Path(data_dir)
    from validate_data import validate_dataset

    sft_splits = validate_dataset(data_dir)
    sft_prompts = {
        example["user_prompt"]
        for split_examples in sft_splits.values()
        for example in split_examples
    }
    examples_by_split = {}
    seen_prompts = {}
    for split in SPLITS:
        path = Path(data_dir) / f"preference_{split}.jsonl"
        if not path.is_file():
            raise ValueError(f"Missing preference data file: {path}")
        examples = _read_split(path)
        for index, example in enumerate(examples, start=1):
            if example["user_prompt"] in sft_prompts:
                raise ValueError(
                    f"{path}:{index}: prompt also appears in an SFT split; "
                    "keep SFT and preference prompts independent"
                )
            previous = seen_prompts.get(example["user_prompt"])
            if previous:
                raise ValueError(
                    f"{path}:{index}: prompt also appears in {previous}; "
                    "keep preference prompts separate across splits"
                )
            seen_prompts[example["user_prompt"]] = f"{split}.jsonl:{index}"
        examples_by_split[split] = examples
    return examples_by_split


def main():
    parser = argparse.ArgumentParser(description="Validate human-ranked MakingGPT preference pairs.")
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    args = parser.parse_args()

    examples = validate_preferences(args.data_dir)
    for split, rows in examples.items():
        print(f"preference_{split}: {len(rows)} valid comparisons")
    if len(examples["train"]) < MIN_TRAIN_PREFERENCES:
        print(
            f"Warning: aim for at least {MIN_TRAIN_PREFERENCES} reviewed training comparisons "
            "before a meaningful reward-model experiment.",
            file=sys.stderr,
        )
    for split in ("valid", "test"):
        if len(examples[split]) < MIN_EVAL_PREFERENCES:
            print(
                f"Warning: aim for at least {MIN_EVAL_PREFERENCES} independent {split} comparisons "
                "for more stable evaluation.",
                file=sys.stderr,
            )
    print("Format and split-integrity checks passed; these checks do not assess ranking quality.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error))
