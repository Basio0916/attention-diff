# Plugin Command Flow

The MVP plugin command is:

```text
/attention-diff <pr-number-or-url>
```

The command prepares deterministic artifacts, asks Codex or Claude Code to write `attention.json`, validates it, and serves the viewer.

## Manual Local Flow

The local command entrypoint is:

```bash
node scripts/attention-diff.mjs 190
```

It prepares the run and prints the paths Codex or Claude Code should use next.
Until the full plugin wrapper exists, the following commands expose the same flow step by step.

1. Prepare run artifacts:

```bash
node scripts/attention-diff-prepare.mjs 190
```

2. Read the printed `diffPath`.

3. Ask Codex or Claude Code to generate `attention.json` at the printed path.
   The prompt uses `diff.json` directly as the AI scoring input.
   Write `reviewReason`, `skimReason`, `question`, `label`, and `reason` in Japanese.

4. Validate the generated attention file:

```bash
node scripts/attention-diff-validate.mjs .attention-diff/runs/<runId>
```

5. Serve the viewer:

```bash
node scripts/attention-diff-serve.mjs <runId>
```

The serve command reuses the existing workspace viewer server when `.attention-diff/server.json` points to a live `/health` endpoint. If the recorded server is stale, it starts a new one and rewrites `server.json`.

6. Open the printed URL.

## Debug Artifacts

By default, a run directory keeps only the stable renderer artifacts:

```text
.attention-diff/runs/<runId>/
  diff.json
  attention.json
```

When parser or prompt debugging is needed, pass `--keep-artifacts`:

```bash
node scripts/attention-diff.mjs 190 --keep-artifacts
```

This additionally keeps `pr.json`, `raw.diff`, and `scoring-prompt.md`.

## Repair Rule

If validation fails, provide the validation command output and the original `attention.json` to Codex or Claude Code and ask it to fix only `attention.json`. Run validation again. Try repair at most two times.
