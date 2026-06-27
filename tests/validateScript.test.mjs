import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { parseUnifiedDiff } from "../src/diff/parseUnifiedDiff.mjs";

async function createDiffJson() {
  const rawDiff = await readFile("tests/fixtures/simple.diff", "utf8");
  const pr = JSON.parse(await readFile("tests/fixtures/simple-pr.json", "utf8"));

  return parseUnifiedDiff({
    rawDiff,
    pr,
    repo: "example/repo",
    generatedAt: "2026-06-27T00:00:00.000Z"
  });
}

function createValidAttentionJson(diffJson) {
  return {
    schemaVersion: "0.1",
    targetDiffId: diffJson.diffId,
    rubricVersion: "0.1",
    scoringPromptVersion: "0.1",
    agent: {
      name: "codex",
      model: "gpt-5"
    },
    files: [
      {
        fileId: "file_0001",
        attention: 5,
        hunks: [
          {
            hunkId: "file_0001_hunk_0001",
            attention: 5,
            reviewReason: "Trial users now qualify for a billing discount.",
            skimReason: "The surrounding lines only preserve the existing return shape.",
            question: "Should trial users receive enterprise volume discounts?",
            attentionGroups: [
              {
                id: "file_0001_hunk_0001_group_0001",
                kind: "highlighted",
                attention: 5,
                lineIds: ["file_0001_hunk_0001_line_0002"],
                label: "Eligibility change",
                reason: "This broadens who receives the discount."
              }
            ]
          }
        ]
      },
      {
        fileId: "file_0002",
        attention: 1,
        hunks: [
          {
            hunkId: "file_0002_hunk_0001",
            attention: 1,
            reviewReason: "Only an import was added.",
            skimReason: "This is a mechanical import-only change.",
            question: null,
            attentionGroups: [
              {
                id: "file_0002_hunk_0001_group_0001",
                kind: "deemphasized",
                attention: 1,
                lineIds: ["file_0002_hunk_0001_line_0001"],
                label: "Import only",
                reason: "The line is a mechanical import addition."
              }
            ]
          }
        ]
      }
    ]
  };
}

function runValidateScript(runDir) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/attention-diff-validate.mjs", runDir], {
      cwd: process.cwd()
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}

async function writeRunFiles(runDir, { diffJson, attentionJson }) {
  await writeFile(join(runDir, "diff.json"), `${JSON.stringify(diffJson, null, 2)}\n`);
  await writeFile(join(runDir, "attention.json"), `${JSON.stringify(attentionJson, null, 2)}\n`);
}

test("attention-diff-validate exits 0 and prints validation result for valid attention", async () => {
  const runDir = await mkdtemp(join(tmpdir(), "attention-diff-validate-"));
  const diffJson = await createDiffJson();
  const attentionJson = createValidAttentionJson(diffJson);

  try {
    await writeRunFiles(runDir, { diffJson, attentionJson });

    const result = await runValidateScript(runDir);

    assert.equal(result.code, 0);
    assert.deepEqual(JSON.parse(result.stdout), { valid: true, errors: [], warnings: [] });
    assert.equal(result.stderr, "");
    await assert.rejects(access(join(runDir, "validation.json")));
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("attention-diff-validate exits non-zero and prints validation result for invalid attention", async () => {
  const runDir = await mkdtemp(join(tmpdir(), "attention-diff-validate-"));
  const diffJson = await createDiffJson();
  const attentionJson = createValidAttentionJson(diffJson);
  attentionJson.targetDiffId = "sha256:other";

  try {
    await writeRunFiles(runDir, { diffJson, attentionJson });

    const result = await runValidateScript(runDir);
    const validationJson = JSON.parse(result.stdout);

    assert.equal(result.code, 1);
    assert.equal(validationJson.valid, false);
    assert.match(validationJson.errors.join("\n"), /targetDiffId/);
    assert.equal(result.stderr, "");
    await assert.rejects(access(join(runDir, "validation.json")));
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("attention-diff-validate prints validation result for malformed attention", async () => {
  const runDir = await mkdtemp(join(tmpdir(), "attention-diff-validate-"));
  const diffJson = await createDiffJson();

  try {
    await writeFile(join(runDir, "diff.json"), `${JSON.stringify(diffJson, null, 2)}\n`);
    await writeFile(join(runDir, "attention.json"), "{ invalid json\n");

    const result = await runValidateScript(runDir);
    const validationJson = JSON.parse(result.stdout);

    assert.equal(result.code, 1);
    assert.equal(validationJson.valid, false);
    assert.match(validationJson.errors.join("\n"), /attention\.json/);
    assert.deepEqual(validationJson.warnings, []);
    assert.equal(result.stderr, "");
    await assert.rejects(access(join(runDir, "validation.json")));
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});

test("attention-diff-validate prints validation result for missing attention", async () => {
  const runDir = await mkdtemp(join(tmpdir(), "attention-diff-validate-"));
  const diffJson = await createDiffJson();

  try {
    await writeFile(join(runDir, "diff.json"), `${JSON.stringify(diffJson, null, 2)}\n`);

    const result = await runValidateScript(runDir);
    const validationJson = JSON.parse(result.stdout);

    assert.equal(result.code, 1);
    assert.equal(validationJson.valid, false);
    assert.match(validationJson.errors.join("\n"), /attention\.json/);
    assert.deepEqual(validationJson.warnings, []);
    assert.equal(result.stderr, "");
    await assert.rejects(access(join(runDir, "validation.json")));
  } finally {
    await rm(runDir, { recursive: true, force: true });
  }
});
