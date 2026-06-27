#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prepareRun } from "../src/run/prepareRun.mjs";

const execFileAsync = promisify(execFile);
const prSpecifier = process.argv[2];

if (!prSpecifier) {
  console.error("Usage: node scripts/attention-diff-prepare.mjs <pr-number-or-url>");
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
  attentionPath: `${result.runDir}/attention.json`
}, null, 2));
