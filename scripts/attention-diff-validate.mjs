#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { validateAttention } from "../src/attention/validateAttention.mjs";

const runDir = process.argv[2];
if (!runDir) {
  console.error("Usage: node scripts/attention-diff-validate.mjs <run-dir>");
  process.exit(1);
}

const diffJson = await readJson(join(runDir, "diff.json"), "diff.json");
const attentionJson = await readJson(join(runDir, "attention.json"), "attention.json");
const readErrors = [...diffJson.errors, ...attentionJson.errors];
const result = readErrors.length > 0
  ? { valid: false, errors: readErrors, warnings: [] }
  : validateAttention({ diffJson: diffJson.value, attentionJson: attentionJson.value });

console.log(JSON.stringify(result, null, 2));

if (!result.valid) {
  process.exit(1);
}

async function readJson(path, label) {
  try {
    return { value: JSON.parse(await readFile(path, "utf8")), errors: [] };
  } catch (error) {
    return {
      value: null,
      errors: [`Failed to read or parse ${label}: ${error.message}`]
    };
  }
}
