# ML Pipeline: Learned Ambiguity Ranking

A cross-encoder that ranks the *already-authorized* candidate meanings of an
ambiguous abbreviation, fine-tuned on reviewed evidence, exported to ONNX and
run **in the browser** via Transformers.js — preserving the app's rule that no
document text ever leaves the machine.

## The five stages, mapped to this repository

| Stage | Agent role | Here |
|---|---|---|
| 1. Data synthesis & splitting | DataPrepAgent | `scripts/generate-ambiguity-training-data.mjs` — builds conflict-group records from the dictionary, gold test cases and review submissions, with **group-level leak-free splits** (`ml/data/`) |
| 2. Fine-tuning | TrainingAgent | `ml/train_ranker.py` — DistILBERT pair classifier, optional LoRA (PEFT) |
| 3. Threshold calibration | EvaluationAgent | `calibrate_threshold()` — the score cutoff below which the app falls back to the ambiguity dialog, printed as JSON for the feature-flag config |
| 4. ONNX export | TrainingAgent | `optimum-cli export onnx --model ml/model/merged ml/model/onnx` → shipped to `public/ml/`, loaded in a Web Worker |
| 5. Integration & guardrails | EvalAgent + app | Model output is a **suggestion tier below community evidence**; below threshold or on any error the app silently uses the existing dialog |

## Privacy constraints that shape the data

- Learning events carry **no text** by design — they contribute context
  statistics only, never training sentences.
- Real sentences exist only where a human deliberately submitted them:
  Review-mode corrections (`data/corrections.jsonl`) and layer-D gold cases
  (`public/data/gold-test-cases.jsonl`).
- Everything else is **synthesized templates over the dictionary**, which is
  why the generator exists: it makes training possible before real evidence
  accumulates, while group-level splits keep evaluation honest.

## When to actually train

Not yet. The rule:

- **< 200 real (gold + review) sentences** — synthesized-only training is a
  toy; the rule-based engine plus learned evidence is more accurate. Keep
  collecting via Review Mode.
- **≥ 200 real sentences with stable accuracy gains** — run the pipeline:

  ```bash
  node scripts/generate-ambiguity-training-data.mjs
  pip install "transformers[torch]" datasets peft optimum[onnxruntime]
  python ml/train_ranker.py --train ml/data/ambiguity-train.jsonl \
      --test ml/data/ambiguity-test.jsonl --out ml/model --lora
  optimum-cli export onnx --model ml/model/merged ml/model/onnx
  ```

- Ship only if held-out **group top-1 accuracy beats the dictionary
  baseline** and the calibrated threshold keeps precision ≥ 0.98. Otherwise
  keep learning — more usage can reinforce mistakes, so accuracy on unseen
  groups is the gate.

## Integration plan (stage 5)

1. `public/ml/` hosts the exported ONNX + tokenizer (feature-flagged).
2. The conversion worker lazily imports Transformers.js and scores
   candidates only for ambiguity records the dictionary produced.
3. Model scores map onto the existing decision ladder:

   ```
   explicit user choice
     > personal "Always use this meaning"
       > personal suggestion
         > community suggestion
           > model suggestion (score ≥ threshold, badge shows provenance)
             > ambiguity dialog (fallback — always safe)
   ```

4. The model can never invent a meaning: candidates come from the
   dictionary; removed entries simply stop appearing as candidates, exactly
   as with learned preferences.

## Why not train now

The synthesized corpus (≈2.4k records over 234 conflict groups) covers the
shape but not the variety of real service writing. A model trained on it
would mimic the templates, pass a template-based evaluation, and still lose
to the live evidence system on real sentences. The generator is re-run any
time; the honest gate is reviewed-sentence count, not enthusiasm.
