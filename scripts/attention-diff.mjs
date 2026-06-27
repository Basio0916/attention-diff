#!/usr/bin/env node
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { prepareRun } from "../src/run/prepareRun.mjs";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const prSpecifier = process.argv[2];

if (!prSpecifier) {
  console.error("Usage: node scripts/attention-diff.mjs <pr-number-or-url>");
  process.exit(1);
}

async function runGh(args) {
  const { stdout } = await execFileAsync("gh", args, { maxBuffer: 1024 * 1024 * 50 });
  return stdout;
}

const result = await prepareRun({
  workspaceDir: process.cwd(),
  prSpecifier,
  runGh
});

console.log(JSON.stringify({
  runId: result.runId,
  runDir: result.runDir,
  diffPath: `${result.runDir}/diff.json`,
  scoringPrompt: `${result.runDir}/scoring-prompt.md`,
  attentionPath: `${result.runDir}/attention.json`,
  nextSteps: [
    `Ask Codex or Claude Code to write ${result.runDir}/attention.json using ${result.runDir}/scoring-prompt.md and ${result.runDir}/diff.json.`,
    `Run: node ${join(scriptDir, "attention-diff-validate.mjs")} ${result.runDir}`,
    `Run: node ${join(scriptDir, "attention-diff-serve.mjs")} ${result.runId}`
  ]
}, null, 2));
