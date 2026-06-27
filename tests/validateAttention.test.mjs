import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseUnifiedDiff } from "../src/diff/parseUnifiedDiff.mjs";
import { validateAttention } from "../src/attention/validateAttention.mjs";

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
              },
              {
                id: "file_0001_hunk_0001_group_0002",
                kind: "deemphasized",
                attention: 1,
                lineIds: ["file_0001_hunk_0001_line_0003"],
                label: "Existing return",
                reason: "This line is unchanged context."
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

test("validateAttention accepts valid attention json", async () => {
  const diffJson = await createDiffJson();
  const attentionJson = createValidAttentionJson(diffJson);

  const result = validateAttention({ diffJson, attentionJson });

  assert.deepEqual(result, {
    valid: true,
    errors: [],
    warnings: []
  });
});

test("validateAttention rejects missing line ids and duplicate group ownership", async () => {
  const diffJson = await createDiffJson();
  const attentionJson = createValidAttentionJson(diffJson);
  const hunk = attentionJson.files[0].hunks[0];
  hunk.question = null;
  hunk.attentionGroups = [
    {
      id: "file_0001_hunk_0001_group_0001",
      kind: "highlighted",
      attention: 5,
      lineIds: ["file_0001_hunk_0001_line_9999", "file_0001_hunk_0001_line_0002"],
      label: "Eligibility change",
      reason: "This broadens who receives the discount."
    },
    {
      id: "file_0001_hunk_0001_group_0002",
      kind: "deemphasized",
      attention: 1,
      lineIds: ["file_0001_hunk_0001_line_0002"],
      label: "Existing return",
      reason: "This line is unchanged context."
    }
  ];

  const result = validateAttention({ diffJson, attentionJson });

  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /Unknown lineId/);
  assert.match(result.errors.join("\n"), /assigned to multiple groups/);
  assert.match(result.warnings.join("\n"), /question is null for attention 5/);
});

test("validateAttention rejects targetDiffId mismatch", async () => {
  const diffJson = await createDiffJson();
  const attentionJson = createValidAttentionJson(diffJson);
  attentionJson.targetDiffId = "sha256:other";

  const result = validateAttention({ diffJson, attentionJson });

  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /targetDiffId/);
});

test("validateAttention rejects invalid kind and attention values", async () => {
  const diffJson = await createDiffJson();
  const attentionJson = createValidAttentionJson(diffJson);
  attentionJson.files[0].attention = 6;
  attentionJson.files[0].hunks[0].attentionGroups[0].kind = "important";
  attentionJson.files[0].hunks[0].attentionGroups[0].attention = 0;

  const result = validateAttention({ diffJson, attentionJson });

  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /files\[0\]\.attention/);
  assert.match(result.errors.join("\n"), /kind/);
  assert.match(result.errors.join("\n"), /attentionGroups\[0\]\.attention/);
});

test("validateAttention warns for empty attention groups", async () => {
  const diffJson = await createDiffJson();
  const attentionJson = createValidAttentionJson(diffJson);
  attentionJson.files[0].hunks[0].attentionGroups = [];

  const result = validateAttention({ diffJson, attentionJson });

  assert.equal(result.valid, true);
  assert.match(result.warnings.join("\n"), /attentionGroups is empty/);
});

test("validateAttention warns when file attention differs from max hunk attention", async () => {
  const diffJson = await createDiffJson();
  const attentionJson = createValidAttentionJson(diffJson);
  attentionJson.files[0].attention = 1;

  const result = validateAttention({ diffJson, attentionJson });

  assert.equal(result.valid, true);
  assert.match(result.warnings.join("\n"), /files\[0\]\.attention differs from max hunk attention 5/);
});

test("validateAttention rejects duplicate line ids inside the same group", async () => {
  const diffJson = await createDiffJson();
  const attentionJson = createValidAttentionJson(diffJson);
  attentionJson.files[0].hunks[0].attentionGroups[0].lineIds = [
    "file_0001_hunk_0001_line_0002",
    "file_0001_hunk_0001_line_0002"
  ];

  const result = validateAttention({ diffJson, attentionJson });

  assert.equal(result.valid, false);
  assert.match(
    result.errors.join("\n"),
    /group file_0001_hunk_0001_group_0001 lineIds contains duplicate lineId: file_0001_hunk_0001_line_0002/
  );
  assert.doesNotMatch(result.errors.join("\n"), /assigned to multiple groups/);
});

test("validateAttention rejects unknown fields that could carry code text", async () => {
  const diffJson = await createDiffJson();
  const attentionJson = createValidAttentionJson(diffJson);
  attentionJson.files[0].hunks[0].code = "if (plan === \"enterprise\")";
  attentionJson.files[0].hunks[0].attentionGroups[0].content = "user.isTrial";

  const result = validateAttention({ diffJson, attentionJson });

  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /files\[0\]\.hunks\[0\]\.code is not allowed/);
  assert.match(
    result.errors.join("\n"),
    /files\[0\]\.hunks\[0\]\.attentionGroups\[0\]\.content is not allowed/
  );
});

test("validateAttention rejects duplicate file and hunk entries", async () => {
  const diffJson = await createDiffJson();
  const attentionJson = createValidAttentionJson(diffJson);
  attentionJson.files.push({ ...attentionJson.files[0] });
  attentionJson.files[0].hunks.push({ ...attentionJson.files[0].hunks[0] });

  const result = validateAttention({ diffJson, attentionJson });

  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /Duplicate fileId: file_0001/);
  assert.match(result.errors.join("\n"), /Duplicate hunkId under file_0001: file_0001_hunk_0001/);
});

test("validateAttention rejects missing file and hunk coverage", async () => {
  const diffJson = await createDiffJson();
  const missingFileAttention = createValidAttentionJson(diffJson);
  missingFileAttention.files = missingFileAttention.files.slice(0, 1);

  const missingHunkAttention = createValidAttentionJson(diffJson);
  missingHunkAttention.files[0].hunks = [];

  const missingFileResult = validateAttention({ diffJson, attentionJson: missingFileAttention });
  const missingHunkResult = validateAttention({ diffJson, attentionJson: missingHunkAttention });

  assert.equal(missingFileResult.valid, false);
  assert.match(missingFileResult.errors.join("\n"), /Missing fileId: file_0002/);
  assert.equal(missingHunkResult.valid, false);
  assert.match(missingHunkResult.errors.join("\n"), /Missing hunkId under file_0001: file_0001_hunk_0001/);
});
