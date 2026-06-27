import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareRun } from "../src/run/prepareRun.mjs";

test("prepareRun writes only stable run artifacts by default", async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), "attention-diff-"));
  const rawDiff = await readFile("tests/fixtures/simple.diff", "utf8");
  const pr = JSON.parse(await readFile("tests/fixtures/simple-pr.json", "utf8"));
  const ghCalls = [];

  async function runGh(args) {
    ghCalls.push(args);
    if (args[0] === "repo" && args[1] === "view") {
      return "example/repo\n";
    }
    if (args[0] === "pr" && args[1] === "view") {
      return JSON.stringify(pr);
    }
    if (args[0] === "pr" && args[1] === "diff") {
      return rawDiff;
    }
    throw new Error(`unexpected gh args: ${args.join(" ")}`);
  }

  try {
    const result = await prepareRun({
      workspaceDir,
      prSpecifier: "190",
      runGh,
      generatedAt: "2026-06-27T00:00:00.000Z"
    });

    assert.match(result.runId, /^pr-190-def4567-[a-f0-9]{8}$/);
    assert.equal(result.runDir.endsWith(result.runId), true);

    const diffJson = JSON.parse(await readFile(join(result.runDir, "diff.json"), "utf8"));
    const currentRun = JSON.parse(
      await readFile(join(workspaceDir, ".attention-diff", "current-run.json"), "utf8")
    );

    assert.deepEqual(ghCalls, [
      ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"],
      [
        "pr",
        "view",
        "190",
        "--json",
        "number,title,body,baseRefName,headRefName,baseRefOid,headRefOid,url"
      ],
      ["pr", "diff", "190"]
    ]);
    assert.equal(diffJson.files.length, 2);
    assert.deepEqual(currentRun, { runId: result.runId });
    assert.equal(Object.hasOwn(result, "scoringPrompt"), false);
    await assert.rejects(access(join(result.runDir, "pr.json")));
    await assert.rejects(access(join(result.runDir, "raw.diff")));
    await assert.rejects(access(join(result.runDir, "scoring-prompt.md")));
    await assert.rejects(access(join(result.runDir, "scoring-input.json")));
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("prepareRun keeps debug artifacts when requested", async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), "attention-diff-"));
  const rawDiff = await readFile("tests/fixtures/simple.diff", "utf8");
  const pr = JSON.parse(await readFile("tests/fixtures/simple-pr.json", "utf8"));

  async function runGh(args) {
    if (args[0] === "repo" && args[1] === "view") {
      return "example/repo\n";
    }
    if (args[0] === "pr" && args[1] === "view") {
      return JSON.stringify(pr);
    }
    if (args[0] === "pr" && args[1] === "diff") {
      return rawDiff;
    }
    throw new Error(`unexpected gh args: ${args.join(" ")}`);
  }

  try {
    const result = await prepareRun({
      workspaceDir,
      prSpecifier: "190",
      runGh,
      generatedAt: "2026-06-27T00:00:00.000Z",
      keepArtifacts: true
    });

    const diffJson = JSON.parse(await readFile(join(result.runDir, "diff.json"), "utf8"));
    const prompt = await readFile(join(result.runDir, "scoring-prompt.md"), "utf8");
    const writtenPr = JSON.parse(await readFile(join(result.runDir, "pr.json"), "utf8"));
    const writtenRawDiff = await readFile(join(result.runDir, "raw.diff"), "utf8");

    assert.match(prompt, /Do not include code content/);
    assert.match(prompt, /reviewReason、skimReason、question、label、reason は日本語で書く/);
    assert.match(prompt, /Diff input \(diff\.json\):/);
    assert.doesNotMatch(prompt, /Scoring input:/);
    assert.match(prompt, /"schemaVersion": "0.1"/);
    assert.match(prompt, new RegExp(`"targetDiffId": "${diffJson.diffId}"`));
    assert.match(prompt, /"rubricVersion"/);
    assert.match(prompt, /"scoringPromptVersion"/);
    assert.match(prompt, /"agent"/);
    assert.match(prompt, /"fileId"/);
    assert.match(prompt, /"attention"/);
    assert.match(prompt, /"hunkId"/);
    assert.match(prompt, /"reviewReason"/);
    assert.match(prompt, /"skimReason"/);
    assert.match(prompt, /"question"/);
    assert.match(prompt, /"attentionGroups"/);
    assert.match(prompt, /"kind"/);
    assert.match(prompt, /"lineIds"/);
    assert.match(prompt, /"label"/);
    assert.match(prompt, /"reason"/);
    assert.match(prompt, /"source"/);
    assert.match(prompt, /"type": "add"/);
    assert.deepEqual(writtenPr, pr);
    assert.equal(writtenRawDiff, rawDiff);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("prepareRun removes stale debug artifacts on normal rerun", async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), "attention-diff-"));
  const rawDiff = await readFile("tests/fixtures/simple.diff", "utf8");
  const pr = JSON.parse(await readFile("tests/fixtures/simple-pr.json", "utf8"));

  async function runGh(args) {
    if (args[0] === "repo" && args[1] === "view") {
      return "example/repo\n";
    }
    if (args[0] === "pr" && args[1] === "view") {
      return JSON.stringify(pr);
    }
    if (args[0] === "pr" && args[1] === "diff") {
      return rawDiff;
    }
    throw new Error(`unexpected gh args: ${args.join(" ")}`);
  }

  try {
    const first = await prepareRun({
      workspaceDir,
      prSpecifier: "190",
      runGh,
      generatedAt: "2026-06-27T00:00:00.000Z",
      keepArtifacts: true
    });
    await writeFile(join(first.runDir, "attention.json"), "{}\n");
    await writeFile(join(first.runDir, "validation.json"), "{}\n");

    const second = await prepareRun({
      workspaceDir,
      prSpecifier: "190",
      runGh,
      generatedAt: "2026-06-27T00:00:00.000Z"
    });

    assert.equal(second.runDir, first.runDir);
    await access(join(second.runDir, "diff.json"));
    await access(join(second.runDir, "attention.json"));
    await assert.rejects(access(join(second.runDir, "pr.json")));
    await assert.rejects(access(join(second.runDir, "raw.diff")));
    await assert.rejects(access(join(second.runDir, "scoring-prompt.md")));
    await assert.rejects(access(join(second.runDir, "validation.json")));
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("prepareRun derives repo from PR url when prSpecifier is a URL", async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), "attention-diff-"));
  const rawDiff = await readFile("tests/fixtures/simple.diff", "utf8");
  const pr = JSON.parse(await readFile("tests/fixtures/simple-pr.json", "utf8"));
  const prSpecifier = "https://github.com/example/repo/pull/190";
  const ghCalls = [];

  async function runGh(args) {
    ghCalls.push(args);
    if (args[0] === "repo" && args[1] === "view") {
      throw new Error("repo view should not be needed for PR URL input");
    }
    if (args[0] === "pr" && args[1] === "view") {
      return JSON.stringify(pr);
    }
    if (args[0] === "pr" && args[1] === "diff") {
      return rawDiff;
    }
    throw new Error(`unexpected gh args: ${args.join(" ")}`);
  }

  try {
    const result = await prepareRun({
      workspaceDir,
      prSpecifier,
      runGh,
      generatedAt: "2026-06-27T00:00:00.000Z"
    });

    assert.deepEqual(ghCalls, [
      [
        "pr",
        "view",
        prSpecifier,
        "--json",
        "number,title,body,baseRefName,headRefName,baseRefOid,headRefOid,url"
      ],
      ["pr", "diff", prSpecifier]
    ]);
    assert.equal(result.diffJson.source.repo, "example/repo");
    assert.equal(Object.hasOwn(result, "scoringInput"), false);
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
});
