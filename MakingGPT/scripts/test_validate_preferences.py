import json
import tempfile
import unittest
from pathlib import Path

from validate_preferences import validate_preferences


def pair(prompt, chosen="Helpful answer", rejected="Unhelpful answer"):
    return {
        "messages": [{"role": "user", "content": prompt}],
        "chosen": chosen,
        "rejected": rejected,
    }


class ValidatePreferencesTests(unittest.TestCase):
    def write_splits(self, directory, train=None, valid=None, test=None):
        splits = {
            "train": train or [pair("Training prompt")],
            "valid": valid or [pair("Validation prompt")],
            "test": test or [pair("Test prompt")],
        }
        for split, rows in splits.items():
            path = Path(directory) / f"preference_{split}.jsonl"
            path.write_text(
                "".join(f"{json.dumps(row)}\n" for row in rows),
                encoding="utf-8",
            )
        for split in ("train", "valid", "test"):
            path = Path(directory) / f"{split}.jsonl"
            path.write_text(
                json.dumps({
                    "messages": [
                        {"role": "user", "content": f"SFT {split} prompt"},
                        {"role": "assistant", "content": "SFT answer"},
                    ]
                }) + "\n",
                encoding="utf-8",
            )

    def test_valid_preference_splits_pass(self):
        with tempfile.TemporaryDirectory() as directory:
            self.write_splits(directory)
            result = validate_preferences(directory)
            self.assertEqual(len(result["train"]), 1)
            self.assertEqual(result["train"][0]["chosen"], "Helpful answer")

    def test_rejects_identical_answers(self):
        with tempfile.TemporaryDirectory() as directory:
            self.write_splits(directory, train=[pair("Prompt", "Same", "Same")])
            with self.assertRaisesRegex(ValueError, "must differ"):
                validate_preferences(directory)

    def test_rejects_prompt_leakage_across_splits(self):
        with tempfile.TemporaryDirectory() as directory:
            self.write_splits(directory, valid=[pair("Training prompt")])
            with self.assertRaisesRegex(ValueError, "keep preference prompts separate"):
                validate_preferences(directory)

    def test_rejects_overlap_with_sft_prompts(self):
        with tempfile.TemporaryDirectory() as directory:
            self.write_splits(directory, train=[pair("SFT train prompt")])
            with self.assertRaisesRegex(ValueError, "keep SFT and preference prompts independent"):
                validate_preferences(directory)

    def test_requires_prompt_to_end_with_user(self):
        with tempfile.TemporaryDirectory() as directory:
            invalid = pair("Prompt")
            invalid["messages"] = [
                {"role": "user", "content": "Question"},
                {"role": "assistant", "content": "Prior turn"},
            ]
            self.write_splits(directory, train=[invalid])
            with self.assertRaisesRegex(ValueError, "start and end with a user"):
                validate_preferences(directory)

    def test_requires_all_splits(self):
        with tempfile.TemporaryDirectory() as directory:
            self.write_splits(directory)
            (Path(directory) / "preference_valid.jsonl").unlink()
            (Path(directory) / "preference_test.jsonl").unlink()
            (Path(directory) / "preference_train.jsonl").write_text(
                json.dumps(pair("Training prompt")) + "\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "Missing preference data file"):
                validate_preferences(directory)


if __name__ == "__main__":
    unittest.main()
