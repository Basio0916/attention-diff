import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";

test("package exposes a single attention-diff command entrypoint", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));

  assert.equal(packageJson.bin["attention-diff"], "scripts/attention-diff.mjs");
  await access("scripts/attention-diff.mjs", constants.X_OK);
});

test("attention-diff command prints usage without a PR specifier", async () => {
  const result = await runCommand([]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Usage: node scripts\/attention-diff\.mjs <pr-number-or-url>/);
  assert.equal(result.stdout, "");
});

function runCommand(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/attention-diff.mjs", ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
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
