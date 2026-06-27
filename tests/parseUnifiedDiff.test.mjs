import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseUnifiedDiff } from "../src/diff/parseUnifiedDiff.mjs";

test("parseUnifiedDiff creates files, hunks, line ids, and line numbers", async () => {
  const rawDiff = await readFile("tests/fixtures/simple.diff", "utf8");
  const pr = JSON.parse(await readFile("tests/fixtures/simple-pr.json", "utf8"));

  const diffJson = parseUnifiedDiff({
    rawDiff,
    pr,
    repo: "example/repo",
    generatedAt: "2026-06-27T00:00:00.000Z"
  });

  assert.equal(diffJson.schemaVersion, "0.1");
  assert.equal(diffJson.diffId.startsWith("sha256:"), true);
  assert.equal(diffJson.source.provider, "github");
  assert.equal(diffJson.source.repo, "example/repo");
  assert.deepEqual(diffJson.source, {
    provider: "github",
    repo: "example/repo",
    prNumber: 190,
    baseRef: "main",
    headRef: "feature/trial-discount",
    baseSha: "abc1234567890",
    headSha: "def4567890abc",
    title: "Add trial discount handling",
    url: "https://github.com/example/repo/pull/190"
  });
  assert.equal(diffJson.files.length, 2);

  const firstFile = diffJson.files[0];
  assert.equal(firstFile.id, "file_0001");
  assert.equal(firstFile.path, "src/billing/discountPolicy.ts");
  assert.equal(firstFile.status, "modified");
  assert.equal(firstFile.additions, 1);
  assert.equal(firstFile.deletions, 1);

  const firstHunk = firstFile.hunks[0];
  assert.equal(firstHunk.id, "file_0001_hunk_0001");
  assert.equal(firstHunk.header, "@@ -10,7 +10,7 @@ export function shouldApplyVolumeDiscount(user: User, plan: Plan) {");
  assert.equal(firstHunk.oldStart, 10);
  assert.equal(firstHunk.oldLines, 7);
  assert.equal(firstHunk.newStart, 10);
  assert.equal(firstHunk.newLines, 7);
  assert.equal(firstHunk.section, "export function shouldApplyVolumeDiscount(user: User, plan: Plan) {");

  assert.deepEqual(firstHunk.lines.map((line) => line.type), ["remove", "add", "context", "context", "context"]);
  assert.equal(firstHunk.lines[0].id, "file_0001_hunk_0001_line_0001");
  assert.equal(firstHunk.lines[0].oldLine, 10);
  assert.equal(firstHunk.lines[0].newLine, null);
  assert.equal(firstHunk.lines[1].oldLine, null);
  assert.equal(firstHunk.lines[1].newLine, 10);

  const secondHunk = diffJson.files[1].hunks[0];
  assert.deepEqual(secondHunk.lines.map((line) => line.type), ["add", "context", "context", "context"]);
  assert.equal(secondHunk.lines.some((line) => line.type === "meta" && line.content === ""), false);
});

test("parseUnifiedDiff handles file statuses and real unified diff meta lines", async () => {
  const rawDiff = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,1 @@
+export const created = true
\\ No newline at end of file
diff --git a/src/old.ts b/src/old.ts
deleted file mode 100644
index 2222222..0000000
--- a/src/old.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-export const removed = true
\\ No newline at end of file
diff --git a/src/name-old.ts b/src/name-new.ts
similarity index 88%
rename from src/name-old.ts
rename to src/name-new.ts
index 3333333..4444444 100644
--- a/src/name-old.ts
+++ b/src/name-new.ts
@@ -1 +1 @@
-export const name = "old"
+export const name = "new"
`;
  const pr = JSON.parse(await readFile("tests/fixtures/simple-pr.json", "utf8"));

  const diffJson = parseUnifiedDiff({
    rawDiff,
    pr,
    repo: "example/repo",
    generatedAt: "2026-06-27T00:00:00.000Z"
  });

  assert.deepEqual(
    diffJson.files.map((file) => file.status),
    ["added", "deleted", "renamed"]
  );
  assert.equal(diffJson.files[0].path, "src/new.ts");
  assert.equal(diffJson.files[0].oldPath, "/dev/null");
  assert.equal(diffJson.files[1].path, "/dev/null");
  assert.equal(diffJson.files[1].oldPath, "src/old.ts");
  assert.equal(diffJson.files[2].path, "src/name-new.ts");
  assert.equal(diffJson.files[2].oldPath, "src/name-old.ts");

  assert.deepEqual(diffJson.files[0].hunks[0].lines.map((line) => line.type), ["add", "meta"]);
  assert.equal(diffJson.files[0].hunks[0].lines[1].content, "\\ No newline at end of file");
  assert.deepEqual(diffJson.files[1].hunks[0].lines.map((line) => line.type), ["remove", "meta"]);
  assert.equal(diffJson.files[1].hunks[0].lines[1].content, "\\ No newline at end of file");
  assert.equal(diffJson.files[2].hunks[0].section, null);
  assert.deepEqual(diffJson.files[2].hunks[0].lines.map((line) => line.type), ["remove", "add"]);
});
