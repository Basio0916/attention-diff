# Attention Diff Plugin MVP Plan

**Current direction:** `diff.json` is the single source of truth for both the fixed viewer and AI scoring. The older `scoring-input.json` compression step was removed because it did not materially reduce size and introduced format confusion.

## Architecture

```text
gh pr view / gh pr diff
  -> diff.json
  -> attention.json
  -> fixed local viewer
```

## Runtime Artifacts

Each run is written under `.attention-diff/runs/<runId>/`.

Required artifacts:

- `diff.json`: parsed diff, stable IDs, line content, file/hunk/line structure.
- `attention.json`: AI-produced scores and reasons, referencing only IDs from `diff.json`.

Debug-only artifacts with `--keep-artifacts`:

- `pr.json`: GitHub PR metadata from `gh pr view`.
- `raw.diff`: raw unified diff from `gh pr diff`.
- `scoring-prompt.md`: prompt that instructs Codex / Claude Code to read `diff.json` and write `attention.json`.

`scoring-input.json` must not be generated in the MVP flow.

## Implementation Units

- `src/diff/parseUnifiedDiff.mjs`: parse raw unified diff into `diff.json`.
- `src/prompt/createScoringPrompt.mjs`: embed `diff.json` and the `attention.json` schema instructions.
- `src/run/prepareRun.mjs`: write `diff.json`, and write debug artifacts only when `keepArtifacts` is enabled.
- `src/attention/validateAttention.mjs`: validate schema, unknown fields, duplicate IDs, missing file/hunk coverage, and line references.
- `src/server/viewerServer.mjs`: serve the fixed viewer and run artifacts.
- `src/viewer/*`: render unified/split diff from `diff.json` + validated `attention.json`.
- `scripts/attention-diff.mjs`: plugin-command entrypoint.
- `scripts/attention-diff-validate.mjs`: validate `attention.json` from disk.
- `scripts/attention-diff-serve.mjs`: serve a run locally.

## Validation Rules

Validation errors:

- JSON parse failure.
- Missing required field.
- Type mismatch.
- Unknown field in `attention.json`.
- `targetDiffId` mismatch.
- Invalid `attention` value.
- Invalid `attentionGroups.kind`.
- Unknown `fileId`, `hunkId`, or `lineId`.
- Duplicate `fileId` or duplicate `hunkId` under a file.
- Missing file/hunk coverage from `diff.json`.
- Empty `lineIds`.
- Same line assigned to multiple groups in one hunk.

Warnings:

- Long labels or reasons.
- `question` is null when hunk attention is 4 or 5.
- `highlighted` has attention 1 or 2.
- `deemphasized` has attention 3 or higher.
- File/hunk attention differs from max child attention.
- Empty `attentionGroups`.

## Viewer Requirements

- Supports unified and split views.
- Addition rows use green heat colors; removal rows use red heat colors.
- `attention=3` uses ordinary red/green heat, not a separate neutral color.
- Fixed hunk labels are Japanese.
- AI-generated reasons, questions, labels, and group reasons should be Japanese.
- Repeated line labels for the same attention group are rendered once per view.
- If validation output is invalid, ignore `attention.json` and fall back to plain diff. `validation.json` is not written during normal validation.

## Verification

Run:

```bash
npm test
```

Expected result: all tests pass, including checks that normal runs keep only `diff.json` plus user-created `attention.json`, and that `scoring-input.json` is not written.
