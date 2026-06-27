export const SCHEMA_VERSION = "0.1";
export const ATTENTION_KINDS = new Set(["highlighted", "deemphasized"]);

export function formatIndexId(prefix, index) {
  if (!Number.isInteger(index) || index < 1) {
    throw new Error(`Invalid ${prefix} index: ${index}`);
  }

  return `${prefix}_${String(index).padStart(4, "0")}`;
}

export function fileId(fileIndex) {
  return formatIndexId("file", fileIndex);
}

export function hunkId(parentFileId, hunkIndex) {
  return `${parentFileId}_${formatIndexId("hunk", hunkIndex)}`;
}

export function lineId(parentHunkId, lineIndex) {
  return `${parentHunkId}_${formatIndexId("line", lineIndex)}`;
}

export function groupId(parentHunkId, groupIndex) {
  return `${parentHunkId}_${formatIndexId("group", groupIndex)}`;
}
