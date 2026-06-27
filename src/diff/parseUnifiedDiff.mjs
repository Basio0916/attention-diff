import { createHash } from "node:crypto";
import { SCHEMA_VERSION, fileId, hunkId, lineId } from "../schema/ids.mjs";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function stripGitPrefix(path) {
  if (path === "/dev/null") {
    return path;
  }

  return path.replace(/^[ab]\//, "");
}

function parseDiffGitHeader(line) {
  const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
  if (!match) {
    throw new Error(`Invalid diff git header: ${line}`);
  }

  return {
    oldPath: match[1],
    newPath: match[2]
  };
}

function parseHunkHeader(line) {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/.exec(line);
  if (!match) {
    throw new Error(`Invalid hunk header: ${line}`);
  }

  return {
    oldStart: Number(match[1]),
    oldLines: match[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match[3]),
    newLines: match[4] === undefined ? 1 : Number(match[4]),
    section: match[5] === "" ? null : match[5]
  };
}

function createFile({ id, oldPath, newPath }) {
  return {
    id,
    path: newPath,
    oldPath,
    status: "modified",
    additions: 0,
    deletions: 0,
    hunks: []
  };
}

export function parseUnifiedDiff({
  rawDiff,
  pr,
  repo,
  generatedAt = new Date().toISOString(),
  workspacePath = null
}) {
  const files = [];
  const lines = rawDiff.split(/\r?\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  let currentFile = null;
  let currentHunk = null;
  let oldLine = null;
  let newLine = null;

  for (const rawLine of lines) {
    if (rawLine.startsWith("diff --git ")) {
      const paths = parseDiffGitHeader(rawLine);
      const id = fileId(files.length + 1);
      currentFile = createFile({
        id,
        oldPath: paths.oldPath,
        newPath: paths.newPath
      });
      files.push(currentFile);
      currentHunk = null;
      continue;
    }

    if (!currentFile) {
      continue;
    }

    if (rawLine.startsWith("new file mode")) {
      currentFile.status = "added";
      continue;
    }

    if (rawLine.startsWith("deleted file mode")) {
      currentFile.status = "deleted";
      continue;
    }

    if (rawLine.startsWith("rename from ")) {
      currentFile.status = "renamed";
      currentFile.oldPath = stripGitPrefix(rawLine.slice("rename from ".length));
      continue;
    }

    if (rawLine.startsWith("rename to ")) {
      currentFile.status = "renamed";
      currentFile.path = stripGitPrefix(rawLine.slice("rename to ".length));
      continue;
    }

    if (rawLine.startsWith("--- ")) {
      const oldPath = stripGitPrefix(rawLine.slice("--- ".length).split(/\t/)[0]);
      if (oldPath === "/dev/null") {
        currentFile.status = "added";
      }
      currentFile.oldPath = oldPath;
      continue;
    }

    if (rawLine.startsWith("+++ ")) {
      const newPath = stripGitPrefix(rawLine.slice("+++ ".length).split(/\t/)[0]);
      if (newPath === "/dev/null") {
        currentFile.status = "deleted";
      }
      currentFile.path = newPath;
      continue;
    }

    if (rawLine.startsWith("@@ ")) {
      const parsed = parseHunkHeader(rawLine);
      const id = hunkId(currentFile.id, currentFile.hunks.length + 1);
      currentHunk = {
        id,
        header: rawLine,
        ...parsed,
        lines: []
      };
      currentFile.hunks.push(currentHunk);
      oldLine = parsed.oldStart;
      newLine = parsed.newStart;
      continue;
    }

    if (!currentHunk) {
      continue;
    }

    const id = lineId(currentHunk.id, currentHunk.lines.length + 1);
    if (rawLine.startsWith("+")) {
      currentHunk.lines.push({
        id,
        type: "add",
        oldLine: null,
        newLine,
        content: rawLine.slice(1)
      });
      currentFile.additions += 1;
      newLine += 1;
      continue;
    }

    if (rawLine.startsWith("-")) {
      currentHunk.lines.push({
        id,
        type: "remove",
        oldLine,
        newLine: null,
        content: rawLine.slice(1)
      });
      currentFile.deletions += 1;
      oldLine += 1;
      continue;
    }

    if (rawLine.startsWith(" ")) {
      currentHunk.lines.push({
        id,
        type: "context",
        oldLine,
        newLine,
        content: rawLine.slice(1)
      });
      oldLine += 1;
      newLine += 1;
      continue;
    }

    if (rawLine.startsWith("\\ ")) {
      currentHunk.lines.push({
        id,
        type: "meta",
        oldLine: null,
        newLine: null,
        content: rawLine
      });
    }
  }

  const source = {
    provider: "github",
    repo,
    prNumber: pr.number,
    baseRef: pr.baseRefName,
    headRef: pr.headRefName,
    baseSha: pr.baseRefOid,
    headSha: pr.headRefOid,
    title: pr.title,
    url: pr.url
  };
  if (typeof workspacePath === "string" && workspacePath.trim() !== "") {
    source.workspacePath = workspacePath;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    diffId: sha256(rawDiff),
    generatedAt,
    source,
    files
  };
}
