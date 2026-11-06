import json
import sys
from pathlib import Path


DATA_DIR = Path(__file__).resolve().parents[1] / "data"
SPLITS = ("train", "valid", "test")
ALLOWED_ROLES = {"system", "user", "assistant"}
MIN_TRAIN_EXAMPLES = 200
MIN_EVAL_EXAMPLES = 20


def validate_file(path):
    examples = []
    seen_conversations = {}
    with path.open(encoding="utf-8") as data_file:
        for line_number, line in enumerate(data_file, start=1):
            if not line.strip():
                raise ValueError(f"{path}:{line_number}: blank lines are not allowed")
            try:
                example = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(f"{path}:{line_number}: invalid JSON: {error.msg}") from error

            messages = example.get("messages") if isinstance(example, dict) else None
            if not isinstance(messages, list) or not messages:
                raise ValueError(f"{path}:{line_number}: expected a non-empty messages array")

            normalized_messages = []
            for message in messages:
                if not isinstance(message, dict):
                    raise ValueError(f"{path}:{line_number}: each message must be an object")
                role = message.get("role")
                content = message.get("content")
                if not isinstance(role, str) or role not in ALLOWED_ROLES:
                    raise ValueError(f"{path}:{line_number}: unsupported role {role!r}")
                if not isinstance(content, str) or not content.strip():
                    raise ValueError(f"{path}:{line_number}: message content must be non-empty text")
                normalized_messages.append((role, content.strip().casefold()))

            roles = [role for role, _ in normalized_messages]
            conversation_roles = roles[1:] if roles[0] == "system" else roles
            if roles.count("system") > 1 or (roles[0] == "system" and len(roles) == 1):
                raise ValueError(f"{path}:{line_number}: system message must appear once before the conversation")
            if not conversation_roles or conversation_roles[0] != "user" or conversation_roles[-1] != "assistant":
                raise ValueError(f"{path}:{line_number}: conversation must start with user and end with assistant")
            if any(role != ("user" if index % 2 == 0 else "assistant")
                   for index, role in enumerate(conversation_roles)):
                raise ValueError(f"{path}:{line_number}: user and assistant messages must alternate")

            fingerprint = tuple(normalized_messages)
            if fingerprint in seen_conversations:
                previous_line = seen_conversations[fingerprint]
                raise ValueError(
                    f"{path}:{line_number}: duplicate conversation also appears on line {previous_line}"
                )
            seen_conversations[fingerprint] = line_number
            examples.append({
                "line_number": line_number,
                "messages": messages,
                "fingerprint": fingerprint,
                "user_prompt": tuple(content for role, content in normalized_messages if role == "user")
            })

    if not examples:
        raise ValueError(f"{path}: no examples found")
    return examples


def validate_dataset(data_dir=DATA_DIR):
    examples_by_split = {
        split: validate_file(data_dir / f"{split}.jsonl")
        for split in SPLITS
    }

    seen_prompts = {}
    seen_conversations = {}
    for split, examples in examples_by_split.items():
        for example in examples:
            location = f"{split}.jsonl:{example['line_number']}"
            previous_prompt = seen_prompts.get(example["user_prompt"])
            if previous_prompt:
                raise ValueError(
                    f"{location}: user prompt sequence also appears in {previous_prompt}; "
                    "keep evaluation prompts separate from training prompts"
                )
            seen_prompts[example["user_prompt"]] = location

            previous_conversation = seen_conversations.get(example["fingerprint"])
            if previous_conversation:
                raise ValueError(
                    f"{location}: conversation also appears in {previous_conversation}; "
                    "remove duplicate examples across splits"
                )
            seen_conversations[example["fingerprint"]] = location

    return examples_by_split


def main():
    examples_by_split = validate_dataset()
    total = sum(len(examples) for examples in examples_by_split.values())
    for split, examples in examples_by_split.items():
        print(f"{split}: {len(examples)} valid examples")
    if len(examples_by_split["train"]) < MIN_TRAIN_EXAMPLES:
        print(
            f"Warning: training has {len(examples_by_split['train'])} examples; "
            f"aim for at least {MIN_TRAIN_EXAMPLES} reviewed examples before a meaningful experiment.",
            file=sys.stderr
        )
    for split in ("valid", "test"):
        if len(examples_by_split[split]) < MIN_EVAL_EXAMPLES:
            print(
                f"Warning: {split} has {len(examples_by_split[split])} examples; "
                f"aim for at least {MIN_EVAL_EXAMPLES} independent examples for a more stable evaluation.",
                file=sys.stderr
            )
    print(f"All {total} examples passed format and split-integrity checks.")
    print("Note: these checks cannot verify factual accuracy, originality, privacy, or answer quality.")


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError) as error:
        raise SystemExit(str(error))
