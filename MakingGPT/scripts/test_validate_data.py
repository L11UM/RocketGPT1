import json
import tempfile
import unittest
from pathlib import Path

from validate_data import validate_dataset


def example(prompt, answer):
    return {"messages": [
        {"role": "user", "content": prompt},
        {"role": "assistant", "content": answer}
    ]}


class ValidateDatasetTests(unittest.TestCase):
    def write_splits(self, directory, train=None, valid=None, test=None):
        examples_by_split = {
            "train": train or [example("Train prompt", "Train answer")],
            "valid": valid or [example("Validation prompt", "Validation answer")],
            "test": test or [example("Test prompt", "Test answer")]
        }
        for split, examples in examples_by_split.items():
            path = Path(directory) / f"{split}.jsonl"
            path.write_text(
                "".join(f"{json.dumps(item)}\n" for item in examples),
                encoding="utf-8"
            )

    def test_existing_dataset_passes_format_and_split_checks(self):
        data_dir = Path(__file__).resolve().parents[1] / "data"
        result = validate_dataset(data_dir)
        self.assertEqual(len(result["train"]), 61)
        self.assertEqual(len(result["valid"]), 8)
        self.assertEqual(len(result["test"]), 8)

    def test_rejects_non_alternating_messages(self):
        with tempfile.TemporaryDirectory() as directory:
            broken = example("Question", "Answer")
            broken["messages"].append({"role": "assistant", "content": "Second answer"})
            self.write_splits(directory, train=[broken])
            with self.assertRaisesRegex(ValueError, "must alternate"):
                validate_dataset(Path(directory))

    def test_rejects_user_prompt_leakage_between_splits(self):
        with tempfile.TemporaryDirectory() as directory:
            self.write_splits(
                directory,
                train=[example("Same prompt", "Train answer")],
                valid=[example("same prompt", "Different answer")]
            )
            with self.assertRaisesRegex(ValueError, "keep evaluation prompts separate"):
                validate_dataset(Path(directory))

    def test_rejects_duplicate_conversations_within_a_split(self):
        with tempfile.TemporaryDirectory() as directory:
            duplicate = example("Duplicate", "Answer")
            self.write_splits(directory, train=[duplicate, duplicate])
            with self.assertRaisesRegex(ValueError, "duplicate conversation"):
                validate_dataset(Path(directory))

    def test_rejects_system_messages_after_the_user_turn(self):
        with tempfile.TemporaryDirectory() as directory:
            broken = {
                "messages": [
                    {"role": "user", "content": "Question"},
                    {"role": "system", "content": "Late instruction"},
                    {"role": "assistant", "content": "Answer"}
                ]
            }
            self.write_splits(directory, train=[broken])
            with self.assertRaisesRegex(ValueError, "must alternate"):
                validate_dataset(Path(directory))


if __name__ == "__main__":
    unittest.main()
