import test from "node:test";
import assert from "node:assert/strict";
import { formatIndexId, groupId, hunkId, lineId } from "../src/schema/ids.mjs";
import { createRunId } from "../src/run/createRunId.mjs";

test("formatIndexId returns four digit order-based ids", () => {
  assert.equal(formatIndexId("file", 1), "file_0001");
  assert.equal(formatIndexId("hunk", 42), "hunk_0042");
});

test("child id helpers append validated order-based ids", () => {
  assert.equal(hunkId("file_0001", 2), "file_0001_hunk_0002");
  assert.equal(lineId("file_0001_hunk_0002", 3), "file_0001_hunk_0002_line_0003");
  assert.equal(groupId("file_0001_hunk_0002", 4), "file_0001_hunk_0002_group_0004");
});

test("child id helpers reject invalid indexes", () => {
  assert.throws(() => hunkId("file_0001", 0), /Invalid hunk index: 0/);
  assert.throws(() => lineId("file_0001_hunk_0001", 1.5), /Invalid line index: 1.5/);
  assert.throws(() => groupId("file_0001_hunk_0001", -1), /Invalid group index: -1/);
});

test("createRunId uses pr number, head sha prefix, and diff id prefix", () => {
  const runId = createRunId({
    prNumber: 190,
    headSha: "def4567890abcdef",
    diffId: "sha256:a1b2c3d4e5f6"
  });

  assert.equal(runId, "pr-190-def4567-a1b2c3d4");
});
