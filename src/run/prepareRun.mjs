import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseUnifiedDiff } from "../diff/parseUnifiedDiff.mjs";
import { createScoringPrompt } from "../prompt/createScoringPrompt.mjs";
import { createRunId } from "./createRunId.mjs";

export async function prepareRun({
  workspaceDir,
  prSpecifier,
  runGh,
  generatedAt = new Date().toISOString()
}) {
  const prSpecifierRepo = repoFromPrUrl(prSpecifier);
  const cwdRepo = prSpecifierRepo
    ? null
    : (await runGh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"])).trim();
  const prJsonText = await runGh([
    "pr",
    "view",
    prSpecifier,
    "--json",
    "number,title,body,baseRefName,headRefName,baseRefOid,headRefOid,url"
  ]);
  const rawDiff = await runGh(["pr", "diff", prSpecifier]);
  const pr = JSON.parse(prJsonText);
  const repo = prSpecifierRepo || repoFromPrUrl(pr.url) || cwdRepo;
  const diffJson = parseUnifiedDiff({ rawDiff, pr, repo, generatedAt });
  const runId = createRunId({
    prNumber: pr.number,
    headSha: pr.headRefOid,
    diffId: diffJson.diffId
  });
  const runDir = join(workspaceDir, ".attention-diff", "runs", runId);

  await mkdir(runDir, { recursive: true });
  await writeJson(join(runDir, "pr.json"), pr);
  await writeFile(join(runDir, "raw.diff"), rawDiff);
  await writeJson(join(runDir, "diff.json"), diffJson);
  await writeFile(join(runDir, "scoring-prompt.md"), createScoringPrompt({ diffJson }));
  await writeJson(join(workspaceDir, ".attention-diff", "current-run.json"), { runId });

  return { runId, runDir, diffJson };
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function repoFromPrUrl(url) {
  if (typeof url !== "string" || url.trim() === "") {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") {
      return null;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 4 && parts[2] === "pull") {
      return `${parts[0]}/${parts[1]}`;
    }
  } catch {
    return null;
  }

  return null;
}
