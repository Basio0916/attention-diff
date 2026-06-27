# Attention Diff

Attention Diff is a local plugin workflow for GitHub pull request review. It renders a rich diff viewer that highlights where human judgment is needed and de-emphasizes mechanical or high-confidence changes.

The goal is not to replace human review. The goal is to help reviewers decide where to look first.

## What It Does

1. Runs `gh pr view` and `gh pr diff` for a target pull request.
2. Writes deterministic run artifacts under `.attention-diff/runs/<runId>/`.
3. Asks Codex or Claude Code to create `attention.json` from `diff.json`.
4. Validates `attention.json` against `diff.json`.
5. Serves a local viewer with unified and split diff views.

## Requirements

- Node.js 20 or later
- GitHub CLI (`gh`) authenticated for the target repository
- Codex or Claude Code for generating `attention.json`

## Install With Codex

```bash
codex plugin marketplace add Basio0916/attention-diff --ref main
codex plugin add attention-diff@attention-diff
```

Start a new Codex thread after installing so the skill is loaded.

## Install With Claude Code

```bash
claude plugin marketplace add Basio0916/attention-diff
claude plugin install attention-diff@attention-diff
```

Restart Claude Code or start a new session after installing so the plugin is loaded.

## Use After Plugin Install

From a GitHub repository:

```text
Attention DiffでPR 190を見せて
```

The installed plugin exposes an agent skill. The agent will run the bundled Node scripts from the installed plugin directory.

## Use From This Checkout

```bash
node scripts/attention-diff.mjs 190
```

The command prints the run directory and the next commands for validation and serving.

## Manual Development Flow

```bash
npm test
node scripts/attention-diff.mjs <pr-number-or-url>
```

The viewer serves static assets from this repository, including a vendored `highlight.js` build, so installed plugins do not need to run `npm install`.

## Design Notes

See:

- `docs/product-brief.md`
- `docs/attention-diff-rubric.md`
- `docs/mvp-plan.md`
- `docs/plugin-command-flow.md`
