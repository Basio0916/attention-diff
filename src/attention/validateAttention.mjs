import { ATTENTION_KINDS, SCHEMA_VERSION } from "../schema/ids.mjs";

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isAttention(value) {
  return Number.isInteger(value) && value >= 1 && value <= 5;
}

function pushUnknownKeyErrors(errors, value, allowedKeys, path) {
  if (!isObject(value)) {
    return;
  }

  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      errors.push(path ? `${path}.${key} is not allowed` : `${key} is not allowed`);
    }
  }
}

function pushRequiredStringError(errors, value, path) {
  if (typeof value !== "string") {
    errors.push(`${path} must be a string`);
    return;
  }

  if (value.trim() === "") {
    errors.push(`${path} must be non-empty`);
  }
}

function pushAttentionError(errors, value, path) {
  if (!isAttention(value)) {
    errors.push(`${path} must be an integer from 1 to 5`);
  }
}

const ROOT_KEYS = new Set([
  "schemaVersion",
  "targetDiffId",
  "rubricVersion",
  "scoringPromptVersion",
  "agent",
  "files"
]);
const AGENT_KEYS = new Set(["name", "model"]);
const FILE_KEYS = new Set(["fileId", "attention", "hunks"]);
const HUNK_KEYS = new Set([
  "hunkId",
  "attention",
  "reviewReason",
  "skimReason",
  "question",
  "attentionGroups"
]);
const GROUP_KEYS = new Set(["id", "kind", "attention", "lineIds", "label", "reason"]);

function createDiffIndex(diffJson) {
  const files = new Map();

  for (const file of diffJson?.files || []) {
    const hunks = new Map();
    for (const hunk of file.hunks || []) {
      hunks.set(hunk.id, {
        hunk,
        lineIds: new Set((hunk.lines || []).map((line) => line.id))
      });
    }
    files.set(file.id, { file, hunks });
  }

  return files;
}

function validateGroup({
  group,
  groupPath,
  hunkLineIds,
  assignedLineIds,
  groupIds,
  errors,
  warnings
}) {
  if (!isObject(group)) {
    errors.push(`${groupPath} must be an object`);
    return null;
  }

  pushUnknownKeyErrors(errors, group, GROUP_KEYS, groupPath);
  pushRequiredStringError(errors, group.id, `${groupPath}.id`);
  if (isNonEmptyString(group.id)) {
    if (groupIds.has(group.id)) {
      errors.push(`${groupPath}.id must be unique: ${group.id}`);
    }
    groupIds.add(group.id);
  }

  if (!ATTENTION_KINDS.has(group.kind)) {
    errors.push(`${groupPath}.kind must be highlighted or deemphasized`);
  }

  pushAttentionError(errors, group.attention, `${groupPath}.attention`);
  if (group.kind === "highlighted" && isAttention(group.attention) && group.attention <= 2) {
    warnings.push(`${groupPath} highlighted attention ${group.attention} is low`);
  }
  if (group.kind === "deemphasized" && isAttention(group.attention) && group.attention >= 3) {
    warnings.push(`${groupPath} deemphasized attention ${group.attention} is high`);
  }

  if (!Array.isArray(group.lineIds)) {
    errors.push(`${groupPath}.lineIds must be an array`);
  } else if (group.lineIds.length === 0) {
    errors.push(`${groupPath}.lineIds must be non-empty`);
  } else {
    const groupLineIds = new Set();
    for (const lineId of group.lineIds) {
      if (typeof lineId !== "string") {
        errors.push(`${groupPath}.lineIds must contain only strings`);
        continue;
      }

      if (groupLineIds.has(lineId)) {
        errors.push(`group ${group.id} lineIds contains duplicate lineId: ${lineId}`);
        continue;
      }
      groupLineIds.add(lineId);

      if (!hunkLineIds.has(lineId)) {
        errors.push(`Unknown lineId in ${groupPath}: ${lineId}`);
      }

      if (assignedLineIds.has(lineId)) {
        errors.push(`lineId assigned to multiple groups in same hunk: ${lineId}`);
      }
      assignedLineIds.add(lineId);
    }
  }

  pushRequiredStringError(errors, group.label, `${groupPath}.label`);
  if (typeof group.label === "string" && group.label.length > 30) {
    warnings.push(`${groupPath}.label is longer than 30 chars`);
  }

  pushRequiredStringError(errors, group.reason, `${groupPath}.reason`);
  if (typeof group.reason === "string" && group.reason.length > 200) {
    warnings.push(`${groupPath}.reason is longer than 200 chars`);
  }

  return isAttention(group.attention) ? group.attention : null;
}

export function validateAttention({ diffJson, attentionJson }) {
  const errors = [];
  const warnings = [];
  const diffFiles = createDiffIndex(diffJson);

  if (!isObject(attentionJson)) {
    return {
      valid: false,
      errors: ["attentionJson must be an object"],
      warnings
    };
  }

  pushUnknownKeyErrors(errors, attentionJson, ROOT_KEYS, "");
  if (attentionJson.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${SCHEMA_VERSION}`);
  }

  pushRequiredStringError(errors, attentionJson.targetDiffId, "targetDiffId");
  pushRequiredStringError(errors, attentionJson.rubricVersion, "rubricVersion");
  pushRequiredStringError(errors, attentionJson.scoringPromptVersion, "scoringPromptVersion");

  if (typeof attentionJson.targetDiffId === "string" && attentionJson.targetDiffId !== diffJson?.diffId) {
    errors.push(`targetDiffId must match diffJson.diffId`);
  }

  if (!isObject(attentionJson.agent)) {
    errors.push("agent must be an object");
  } else {
    pushUnknownKeyErrors(errors, attentionJson.agent, AGENT_KEYS, "agent");
    pushRequiredStringError(errors, attentionJson.agent.name, "agent.name");
    pushRequiredStringError(errors, attentionJson.agent.model, "agent.model");
  }

  if (!Array.isArray(attentionJson.files)) {
    errors.push("files must be an array");
    return { valid: false, errors, warnings };
  }

  const seenFileIds = new Set();
  const seenHunkIdsByFileId = new Map();

  attentionJson.files.forEach((file, fileIndex) => {
    const filePath = `files[${fileIndex}]`;
    if (!isObject(file)) {
      errors.push(`${filePath} must be an object`);
      return;
    }

    pushUnknownKeyErrors(errors, file, FILE_KEYS, filePath);
    pushRequiredStringError(errors, file.fileId, `${filePath}.fileId`);
    pushAttentionError(errors, file.attention, `${filePath}.attention`);

    if (isNonEmptyString(file.fileId)) {
      if (seenFileIds.has(file.fileId)) {
        errors.push(`Duplicate fileId: ${file.fileId}`);
      }
      seenFileIds.add(file.fileId);
    }

    const diffFile = diffFiles.get(file.fileId);
    if (!diffFile) {
      errors.push(`Unknown fileId in ${filePath}: ${file.fileId}`);
    }

    if (!Array.isArray(file.hunks)) {
      errors.push(`${filePath}.hunks must be an array`);
      return;
    }

    const hunkAttentions = [];

    file.hunks.forEach((hunk, hunkIndex) => {
      const hunkPath = `${filePath}.hunks[${hunkIndex}]`;
      if (!isObject(hunk)) {
        errors.push(`${hunkPath} must be an object`);
        return;
      }

      pushUnknownKeyErrors(errors, hunk, HUNK_KEYS, hunkPath);
      pushRequiredStringError(errors, hunk.hunkId, `${hunkPath}.hunkId`);
      pushAttentionError(errors, hunk.attention, `${hunkPath}.attention`);
      if (isNonEmptyString(file.fileId) && isNonEmptyString(hunk.hunkId)) {
        if (!seenHunkIdsByFileId.has(file.fileId)) {
          seenHunkIdsByFileId.set(file.fileId, new Set());
        }
        const seenHunkIds = seenHunkIdsByFileId.get(file.fileId);
        if (seenHunkIds.has(hunk.hunkId)) {
          errors.push(`Duplicate hunkId under ${file.fileId}: ${hunk.hunkId}`);
        }
        seenHunkIds.add(hunk.hunkId);
      }

      if (isAttention(hunk.attention)) {
        hunkAttentions.push(hunk.attention);
      }
      pushRequiredStringError(errors, hunk.reviewReason, `${hunkPath}.reviewReason`);
      pushRequiredStringError(errors, hunk.skimReason, `${hunkPath}.skimReason`);

      if (!(typeof hunk.question === "string" || hunk.question === null)) {
        errors.push(`${hunkPath}.question must be a string or null`);
      }
      if (isAttention(hunk.attention) && hunk.attention >= 4 && hunk.question === null) {
        warnings.push(`${hunkPath}.question is null for attention ${hunk.attention}`);
      }

      const diffHunk = diffFile?.hunks.get(hunk.hunkId);
      if (!diffHunk) {
        errors.push(`Unknown hunkId under ${file.fileId} in ${hunkPath}: ${hunk.hunkId}`);
      }

      if (!Array.isArray(hunk.attentionGroups)) {
        errors.push(`${hunkPath}.attentionGroups must be an array`);
        return;
      }
      if (hunk.attentionGroups.length === 0) {
        warnings.push(`${hunkPath}.attentionGroups is empty`);
        return;
      }

      const assignedLineIds = new Set();
      const groupIds = new Set();
      const groupAttentions = [];
      const hunkLineIds = diffHunk?.lineIds || new Set();

      hunk.attentionGroups.forEach((group, groupIndex) => {
        const groupAttention = validateGroup({
          group,
          groupPath: `${hunkPath}.attentionGroups[${groupIndex}]`,
          hunkLineIds,
          assignedLineIds,
          groupIds,
          errors,
          warnings
        });
        if (groupAttention !== null) {
          groupAttentions.push(groupAttention);
        }
      });

      if (groupAttentions.length > 0 && isAttention(hunk.attention)) {
        const maxGroupAttention = Math.max(...groupAttentions);
        if (hunk.attention !== maxGroupAttention) {
          warnings.push(`${hunkPath}.attention differs from max group attention ${maxGroupAttention}`);
        }
      }
    });

    if (hunkAttentions.length > 0 && isAttention(file.attention)) {
      const maxHunkAttention = Math.max(...hunkAttentions);
      if (file.attention !== maxHunkAttention) {
        warnings.push(`${filePath}.attention differs from max hunk attention ${maxHunkAttention}`);
      }
    }
  });

  for (const [fileId, diffFile] of diffFiles) {
    if (!seenFileIds.has(fileId)) {
      errors.push(`Missing fileId: ${fileId}`);
      continue;
    }

    const seenHunkIds = seenHunkIdsByFileId.get(fileId) || new Set();
    for (const hunkId of diffFile.hunks.keys()) {
      if (!seenHunkIds.has(hunkId)) {
        errors.push(`Missing hunkId under ${fileId}: ${hunkId}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}
