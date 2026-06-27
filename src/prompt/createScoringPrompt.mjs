export function createScoringPrompt({ diffJson }) {
  const attentionSkeleton = {
    schemaVersion: "0.1",
    targetDiffId: diffJson.diffId,
    rubricVersion: "0.1",
    scoringPromptVersion: "0.1",
    agent: {
      name: "codex",
      model: "fill-in-model"
    },
    files: [
      {
        fileId: "file_0001",
        attention: 3,
        hunks: [
          {
            hunkId: "file_0001_hunk_0001",
            attention: 3,
            reviewReason: "このhunkで人間の確認が必要な理由。",
            skimReason: "このhunkで軽く見てよい部分の理由。",
            question: null,
            attentionGroups: [
              {
                id: "file_0001_hunk_0001_group_0001",
                kind: "highlighted",
                attention: 4,
                lineIds: ["file_0001_hunk_0001_line_0001"],
                label: "確認が必要",
                reason: "この行群にレビューが必要な理由。"
              }
            ]
          }
        ]
      }
    ]
  };

  return [
    "# Attention Diff Scoring",
    "",
    "You are producing attention.json for Attention Diff.",
    "",
    "Rules:",
    "- Highlight human judgment need, not generic risk.",
    "- Do not claim a bug unless evidence is strong.",
    "- Do not include code content in the output.",
    "- Use only fileId, hunkId, and lineId values from diff.json.",
    "- attentionGroups.kind must be highlighted or deemphasized.",
    "- attention must be an integer from 1 to 5.",
    "- Include deemphasized groups when lines can be lightly reviewed.",
    "- Use question as a string for hunk attention 4 or 5; use null when no question is useful.",
    "- reviewReason、skimReason、question、label、reason は日本語で書く。",
    "",
    "Return only valid JSON in the attention.json schema.",
    "",
    "attention.json schema skeleton:",
    "",
    "```json",
    JSON.stringify(attentionSkeleton, null, 2),
    "```",
    "",
    "Diff input (diff.json):",
    "",
    "```json",
    JSON.stringify(diffJson, null, 2),
    "```"
  ].join("\n");
}
