# MakingGPT

The MakingGPT project page and guide are accessible online from any computer with a web browser and internet connection. MakingGPT is an experimental instruction-tuning project aiming to help an AI model follow human instructions more reliably. Its planned human-feedback workflow is inspired by the broad three-stage approach used by InstructGPT—supervised fine-tuning (SFT), a reward model trained from human-ranked answer pairs, and reinforcement learning with PPO. This is an independent, small-scale experiment, not an exact reproduction of InstructGPT.

The existing local adapter workflow uses MLX-LM. A separate Transformers/TRL workflow implements SFT, reward-model training, and PPO; its checkpoints are local and are not hosted. The checked-in SFT data files are format samples only—61 training examples and 8 examples in each evaluation split—and are far too few to establish useful model quality. No SFT/RLHF checkpoint is included in the repository. MakingGPT is not a foundation model trained from scratch, is much smaller than GPT-3, and is not equivalent to GPT-3. It has not been shown to follow instructions better than Rocket 2.0; that claim would require a trained model and a fair evaluation on held-out prompts. The public RocketGPT site continues to use Pollinations' third-party AI service; this local experiment does not replace it.

## Requirements

- Apple Silicon hardware with a supported MLX-LM environment
- Python 3.11 or newer (older system Python versions may not support current MLX-LM)
- Several GB of free disk space for the environment and model download

## Set up

From this directory:

```sh
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python scripts/validate_data.py
```

If `python3.11` is not installed, install a current Python 3.11+ build for your environment first. Keep `.venv/` inside this project; it is ignored by Git.

## Prepare examples

Each line in `data/train.jsonl`, `data/valid.jsonl`, and `data/test.jsonl` is one JSON object with a `messages` array. Use `system` (optional), `user`, and `assistant` roles, with the assistant answer last. Keep examples original, accurate, and representative of how you want MakingGPT to respond. Do not include passwords, API keys, or private data.

For a useful first experiment, collect at least a few hundred carefully reviewed examples, then reserve separate validation and test examples that are not copied into training. More examples are not automatically better; consistency and evaluation matter.

## Train a first adapter

After replacing the format samples with reviewed examples, validate the dataset and run a short experiment:

```sh
python scripts/validate_data.py
TRAIN_ITERS=100 sh scripts/train_adapter.sh
```

The training script checks the splits before starting, evaluates the base model on the held-out test split, trains a LoRA adapter, and reports its test loss. It saves each experiment under a unique `adapters/runs/` directory so runs do not overwrite each other. The current samples do not meet the recommended minimum of 200 reviewed training examples and 20 independent validation and test examples; training stops until the data is expanded. Set `ALLOW_SMALL_DATASET=1` only for an intentional smoke test, not to measure model quality.

The first run downloads the base model. Training time and memory use vary with the data and machine load. Start with a short run, inspect generated answers, and only then increase the iteration count. Do not treat training loss alone as proof that instruction following improved.

## Try the local model preview

After training an adapter, start the local chat page from this directory. Use the experiment path printed by the training script:

```sh
ADAPTER_PATH=adapters/runs/<experiment-id> sh scripts/start_local_demo.sh
```

Open the local URL printed by the script in a browser. By default, the preview uses ports 3000 and 8080. It sends prompts only to the local model server; prompts are not sent to the public RocketGPT site or a hosted AI service. Keep the terminal open while using it, and press Ctrl+C there to stop the preview and any model server started by the script. If the matching MakingGPT model server is already running on your device, the script reuses it and leaves it running. To choose different available ports, run `MODEL_PORT=8081 WEB_PORT=3001 sh scripts/start_local_demo.sh`.

The preview loads the Qwen2.5-1.5B-Instruct base model with your locally trained RocketGPT LoRA adapter. It is an early local prototype, not GPT-3 and not the model used by the public RocketGPT chat.

## Human-feedback training workflow

The separate Transformers/TRL workflow uses three stages:

1. **SFT:** fine-tune Qwen2.5-1.5B-Instruct on reviewed instruction/answer examples.
2. **Reward model:** train a scalar scoring model to prefer the answer humans rank higher.
3. **PPO:** optimize the SFT policy against the reward model while using the SFT model as a reference policy.

This is the same broad family of human-feedback steps as InstructGPT, not a reproduction of its data, model, infrastructure, or results. The pipeline requires `data/preference_train.jsonl`, `data/preference_valid.jsonl`, and `data/preference_test.jsonl`. Each line must contain a prompt conversation ending in a user message and two different answers:

```json
{"messages":[{"role":"user","content":"Explain photosynthesis in one sentence."}],"chosen":"The human-preferred answer.","rejected":"The less-preferred answer."}
```

These are schema instructions, not labeled training data. Add only genuine, reviewed human rankings. Do not copy prompts between preference splits or reuse SFT prompts in preference data. Rank consistently for correctness, helpfulness, instruction-following, honesty, and safety; do not include private data. Aim for at least 1,000 training comparisons and 100 independent comparisons in each validation and test split. The test split stays held out from training and model selection. These minimums still do not guarantee useful alignment.

The training environment is separate from the MLX environment. It uses Transformers and TRL, downloads the base model, and runs SFT/reward/PPO checkpoints locally. PPO loads policy, reference, reward, and value models together and needs a high-memory CUDA GPU; this workflow is not expected to run on a typical laptop. Checkpoint files and local preference split files are ignored by Git; nothing is uploaded or hosted by these scripts.

```sh
python3.11 -m venv .venv-rlhf
source .venv-rlhf/bin/activate
python -m pip install -r requirements-rlhf.txt
python scripts/validate_data.py
python scripts/validate_preferences.py
python scripts/train_sft_rlhf.py
python scripts/train_reward_model.py
python scripts/evaluate_reward_model.py
python scripts/train_ppo.py
python scripts/generate_rlhf.py --prompt "Explain photosynthesis in one sentence."
```

The reward-model evaluator reports agreement with the held-out preference test pairs before PPO. Review that result and generated responses; the score is not a general capability or safety measure. The sample SFT splits currently fail the documented minimums, and no preference rankings are included, so training will stop until you add reviewed data. `ALLOW_SMALL_DATASET=1` bypasses the count gate for smoke tests only; it does not make results meaningful. Run a separate held-out comparison before making claims about model quality or performance versus Rocket 2.0.

## Evaluate and serve an experiment

The training script reports base-model and tuned-adapter test loss on the same held-out split. Compare the base model and adapter on the same prompts and check whether each follows constraints, answers correctly, and avoids unsupported claims. MLX-LM's test loss is useful as a training diagnostic, but it is not a direct instruction-following score.

Pass a trained experiment's directory to serve it:

```sh
sh scripts/serve_model.sh adapters/runs/<experiment-id>
```

## Call the local inference API directly

For command-line testing without the browser preview:

```sh
sh scripts/serve_model.sh adapters/runs/<experiment-id>
```

The API listens only on `127.0.0.1:8080`. For example, send a chat-completions request from another terminal:

```sh
curl http://127.0.0.1:8080/v1/chat/completions \\
  -H 'Content-Type: application/json' \\
  -d '{"messages":[{"role":"user","content":"Explain photosynthesis in one sentence."}],"max_tokens":100}'
```

Requests are processed by the model on this device and are not sent to a hosted AI service.