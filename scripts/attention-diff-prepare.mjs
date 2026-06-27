#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prepareRun } from "../src/run/prepareRun.mjs";

const execFileAsync = promisify(execFile);
const args = process.argv.slice(2);
const keepArtifacts = args.includes("--keep-artifacts");
const prSpecifier = args.find((arg) => arg !== "--keep-artifacts");

if (!prSpecifier) {
  console.error("Usage: node scripts/attention-diff-prepare.mjs <pr-number-or-url> [--keep-artifacts]");
  process.exit(1);
}

async function runGh(args) {
  const { stdout } = await execFileAsync("gh", args, { maxBuffer: 1024 * 1024 * 50 });
  return stdout;
}

const result = await prepareRun({
  workspaceDir: process.cwd(),
  prSpecifier,
  runGh,
  keepArtifacts
});

const output = {
  runId: result.runId,
  runDir: result.runDir,
  diffPath: `${result.runDir}/diff.json`,
  attentionPath: `${result.runDir}/attention.json`,
  keepArtifacts
};

if (keepArtifacts) {
  output.scoringPrompt = `${result.runDir}/scoring-prompt.md`;
}

console.log(JSON.stringify(output, null, 2));
