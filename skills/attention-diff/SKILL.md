---
name: attention-diff
description: Use when the user asks to run Attention Diff on a GitHub pull request, such as "attention-diff 190", "PRの濃淡diffを見たい", or "このPRをAttention Diffで見たい". Prepares gh PR diff artifacts, has the agent produce attention.json, validates it, and serves the local viewer.
---

# Attention Diff

Run Attention Diff for a GitHub pull request in the current repository.

## Workflow

1. Confirm the current working directory is the target GitHub repository.
2. Resolve the plugin root as two directories up from this `SKILL.md`.
3. Run the local command:

```bash
node <plugin-root>/scripts/attention-diff.mjs <pr-number-or-url>
```

4. Read the printed `scoring-prompt.md`.
   - `diff.json` is the AI scoring input and renderer source of truth.
   - There is no `scoring-input.json` in the MVP flow.
5. Produce `attention.json` at the printed `attentionPath`.
   - Return JSON only in the file.
   - Do not include code text in `attention.json`.
   - Use only IDs from `diff.json`.
   - Include every file and hunk from `diff.json`.
   - Use `highlighted` and `deemphasized` groups only.
   - Write `reviewReason`, `skimReason`, `question`, `label`, and `reason` in Japanese.
6. Validate:

```bash
node <plugin-root>/scripts/attention-diff-validate.mjs <runDir>
```

7. If validation fails, repair only `attention.json` and retry validation up to two times.
8. Serve the viewer:

```bash
node <plugin-root>/scripts/attention-diff-serve.mjs <runId>
```

9. Report the local URL.

## Scoring Principle

Emphasize human judgment need, not generic risk. Deemphasize mechanical, generated, import-only, formatting-only, or high-confidence copied-pattern changes. Always explain both highlighted and deemphasized groups in Japanese.

