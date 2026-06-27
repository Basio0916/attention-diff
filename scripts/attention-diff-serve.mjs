#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { startViewerServer } from "../src/server/viewerServer.mjs";

const runId = process.argv[2];

if (!runId) {
  console.error("Usage: node scripts/attention-diff-serve.mjs <run-id>");
  process.exit(1);
}

const workspaceDir = process.cwd();
const serverJsonPath = join(workspaceDir, ".attention-diff", "server.json");
const existingServer = await readExistingServer(serverJsonPath);

if (existingServer && (await isServerAlive(existingServer))) {
  console.log(runUrl(existingServer, runId));
  process.exit(0);
}

const host = "127.0.0.1";
const server = await startViewerServer({ workspaceDir, port: 0, host });

await mkdir(join(workspaceDir, ".attention-diff"), { recursive: true });
await writeFile(
  serverJsonPath,
  `${JSON.stringify(
    {
      pid: process.pid,
      host,
      port: server.port,
      startedAt: new Date().toISOString()
    },
    null,
    2
  )}\n`
);

console.log(runUrl({ port: server.port }, runId));
process.stdin.resume();

async function readExistingServer(path) {
  try {
    const serverJson = JSON.parse(await readFile(path, "utf8"));
    if (
      typeof serverJson.host !== "string" ||
      !Number.isInteger(serverJson.port) ||
      serverJson.port <= 0
    ) {
      return null;
    }
    return serverJson;
  } catch {
    return null;
  }
}

async function isServerAlive(serverJson) {
  try {
    const response = await fetch(`http://${serverJson.host}:${serverJson.port}/health`);
    if (!response.ok) {
      return false;
    }
    const body = await response.json();
    return (
      body.ok === true &&
      body.app === "attention-diff-viewer" &&
      Array.isArray(body.features) &&
      body.features.includes("highlight-js")
    );
  } catch {
    return false;
  }
}

function runUrl(serverJson, targetRunId) {
  return `http://localhost:${serverJson.port}/runs/${targetRunId}`;
}
