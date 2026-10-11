"""
Stage 2/5 of the ML pipeline (TrainingAgent + ONNX export): fine-tunes a
small cross-encoder that scores (sentence, candidate meaning) pairs, then
prepares it for Transformers.js.

The model ranks the candidate meanings attached to each ambiguity record in
ml/data/ambiguity-{train,test}.jsonl. It never sees the dictionary itself —
the app keeps ownership of candidate generation and eligibility; the model
only orders the candidates the dictionary already authorized.

Usage (run only when ml/data holds enough reviewed sentences — see ml/README):

    python -m venv .venv && .venv/Scripts/activate   # or source .venv/bin/activate
    pip install "transformers[torch]" datasets peft optimum[onnxruntime]
    python ml/train_ranker.py --train ml/data/ambiguity-train.jsonl \
                              --test ml/data/ambiguity-test.jsonl \
                              --out ml/model --lora

With --lora the script trains LoRA adapters (PEFT) and merges them before
export. The final section prints the calibrated confidence threshold to copy
into the app's feature-flag config.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from datasets import Dataset, load_dataset
import numpy as np


def load_pairs(path: Path) -> list[dict]:
    """Expands each record into (sentence, meaning, label) pairs."""
    pairs: list[dict] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            record = json.loads(line)
            for candidate in record["candidates"]:
                pairs.append(
                    {
                        "sentence": record["sentence"],
                        "meaning": candidate["meaning"],
                        "label": 1 if candidate["choiceId"] == record["correctMeaningId"] else 0,
                        "group": record["groupKey"],
                    }
                )
    return pairs


def to_dataset(pairs: list[dict], tokenizer, max_length: int = 128) -> Dataset:
    encoded = tokenizer(
        [pair["sentence"] for pair in pairs],
        [pair["meaning"] for pair in pairs],
        truncation=True,
        max_length=max_length,
        padding="max_length",
    )
    encoded["labels"] = [pair["label"] for pair in pairs]
    encoded["group"] = [pair["group"] for pair in pairs]
    return Dataset.from_dict(encoded)


def group_top1_accuracy(model, dataset, tokenizer) -> float:
    """The metric that matters: does the highest-scoring candidate per group
    match the correct meaning? Mirrors how the app consumes the model."""
    by_group: dict[str, list[dict]] = {}
    for item in dataset:
        by_group.setdefault(item["group"], []).append(item)

    correct = 0
    total = 0
    for items in by_group.values():
        scores = model.predict(input_ids=np.array([i["input_ids"] for i in items]),
                               attention_mask=np.array([i["attention_mask"] for i in items]))["logits"]
        positives = scores[:, 1]
        labels = np.array([i["labels"] for i in items])
        total += 1
        if int(np.argmax(positives)) == int(np.argmax(labels)):
            correct += 1
    return correct / max(total, 1)


def calibrate_threshold(model, dataset, target_precision: float = 0.98) -> float:
    """Lowest score cutoff whose precision on positive pairs still meets the
    target. Below the cutoff, the app falls back to the ambiguity dialog."""
    scores = model.predict(
        input_ids=np.array(dataset["input_ids"]),
        attention_mask=np.array(dataset["attention_mask"]),
    )["logits"]
    positives = scores[:, 1]
    labels = np.array(dataset["labels"])
    order = np.argsort(-positives)
    best_cutoff = 1.0
    seen_correct = 0
    for index in order:
        if labels[index] == 1:
            seen_correct += 1
        precision = seen_correct / (index + 1)
        if precision >= target_precision:
            best_cutoff = float(positives[index])
            break
    return best_cutoff


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--test", type=Path, required=True)
    parser.add_argument("--out", type=Path, default=Path("ml/model"))
    parser.add_argument("--base", default="distilbert-base-uncased")
    parser.add_argument("--lora", action="store_true")
    parser.add_argument("--epochs", type=int, default=3)
    args = parser.parse_args()

    from transformers import (
        AutoModelForSequenceClassification,
        AutoTokenizer,
        Trainer,
        TrainingArguments,
    )

    tokenizer = AutoTokenizer.from_pretrained(args.base)
    train_ds = to_dataset(load_pairs(args.train), tokenizer)
    test_ds = to_dataset(load_pairs(args.test), tokenizer)

    model = AutoModelForSequenceClassification.from_pretrained(args.base, num_labels=2)
    if args.lora:
        from peft import LoraConfig, TaskType, get_peft_model

        model = get_peft_model(
            model,
            LoraConfig(task_type=TaskType.SEQ_CLS, r=8, lora_alpha=32, lora_dropout=0.1),
        )

    trainer = Trainer(
        model=model,
        args=TrainingArguments(
            output_dir=str(args.out / "checkpoints"),
            num_train_epochs=args.epochs,
            learning_rate=1e-4 if args.lora else 2e-5,
            per_device_train_batch_size=16,
            eval_strategy="epoch",
            report_to=[],
        ),
        train_dataset=train_ds,
        eval_dataset=test_ds,
    )
    trainer.train()
    trainer.save_model(str(args.out))

    merged = model.merge_and_unload() if args.lora else model
    merged.save_pretrained(str(args.out / "merged"))
    tokenizer.save_pretrained(str(args.out / "merged"))

    accuracy = group_top1_accuracy(merged, test_ds, tokenizer)
    threshold = calibrate_threshold(merged, test_ds)
    print("\n=== Pipeline outputs ===")
    print(f"group top-1 accuracy on held-out groups: {accuracy:.3f}")
    print("calibrated confidence threshold (fallback to dialog below this):")
    print(json.dumps({"autoApplyThreshold": round(threshold, 4),
                      "evaluatedOn": str(args.test),
                      "baseModel": args.base}, indent=2))
    print("\nExport for Transformers.js:")
    print(f"  optimum-cli export onnx --model {args.out / 'merged'} {args.out / 'onnx'}")
    print("Ship only if accuracy beats the dictionary baseline AND the threshold")
    print("keeps precision at or above target; otherwise keep learning.")


if __name__ == "__main__":
    main()
