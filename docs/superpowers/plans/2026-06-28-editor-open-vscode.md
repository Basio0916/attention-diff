# Editor Open VS Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a VS Code-only open link from Attention Diff viewer hunks and line numbers while keeping the opener logic extensible.

**Architecture:** `diff.json.source.workspacePath` records the local workspace path when a run is prepared. The viewer resolves file/line locations independently from the VS Code URL provider, so later providers can reuse line fallback and path resolution.

**Tech Stack:** Node.js ESM, browser JavaScript, Node built-in test runner, existing static viewer CSS.

---

### Task 1: Add `workspacePath` To `diff.json`

**Files:**
- Modify: `src/diff/parseUnifiedDiff.mjs`
- Modify: `src/run/prepareRun.mjs`
- Test: `tests/parseUnifiedDiff.test.mjs`
- Test: `tests/prepareRun.test.mjs`

- [ ] **Step 1: Write failing tests**

Add assertions that `parseUnifiedDiff({ workspacePath })` includes `source.workspacePath`, and `prepareRun({ workspaceDir })` writes the same value into `diff.json.source.workspacePath`.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/parseUnifiedDiff.test.mjs tests/prepareRun.test.mjs`

Expected: fail because `workspacePath` is not present.

- [ ] **Step 3: Implement minimal data flow**

Pass `workspaceDir` from `prepareRun` into `parseUnifiedDiff` as `workspacePath`, and include it in `source` only when it is a non-empty string.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/parseUnifiedDiff.test.mjs tests/prepareRun.test.mjs`

Expected: pass.

### Task 2: Add Viewer Location Resolution And VS Code Provider

**Files:**
- Modify: `src/viewer/app.js`
- Test: `tests/viewerServer.test.mjs`

- [ ] **Step 1: Write failing viewer tests**

Add a VM test with `source.workspacePath`, a normal modified file, add/context/remove lines, and assert:

```text
VS Codeで開く
vscode://file//Users/example/repo/src/example.js:9:1
vscode://file//Users/example/repo/src/example.js:10:1
```

Also add a no-`workspacePath` case that asserts no `vscode://file/` link and no `VS Codeで開く` button.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/viewerServer.test.mjs`

Expected: fail because the viewer does not render editor links.

- [ ] **Step 3: Implement minimal helpers**

Add helpers in `src/viewer/app.js`:

```js
function resolveLineTarget(lines, line) {
  if (Number.isInteger(line?.newLine) && line.newLine > 0) return line.newLine;
  const index = lines.findIndex((candidate) => candidate?.id === line?.id);
  for (let offset = index + 1; offset < lines.length; offset += 1) {
    if (Number.isInteger(lines[offset]?.newLine) && lines[offset].newLine > 0) {
      return lines[offset].newLine;
    }
  }
  for (let offset = index - 1; offset >= 0; offset -= 1) {
    if (Number.isInteger(lines[offset]?.newLine) && lines[offset].newLine > 0) {
      return lines[offset].newLine;
    }
  }
  return null;
}

function resolveFileLocation(workspacePath, filePath, lineNumber) {
  return { absolutePath: `${workspacePath}/${filePath}`, line: lineNumber, column: 1 };
}

const OPEN_TARGETS = {
  vscode: {
    label: "VS Code",
    createUrl(location) {
      return `vscode://file/${encodeURI(location.absolutePath)}:${location.line}:${location.column}`;
    }
  }
};
```

Use them from hunk and line rendering. Do not add a dropdown.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/viewerServer.test.mjs`

Expected: pass.

### Task 3: Style The Link UI Conservatively

**Files:**
- Modify: `src/viewer/styles.css`
- Test: `tests/viewerServer.test.mjs`

- [ ] **Step 1: Write failing style assertions**

Assert the CSS includes `.open-editor-link`, `.line-number-link`, and no dropdown-specific selector such as `.open-menu`.

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/viewerServer.test.mjs`

Expected: fail because link styles do not exist.

- [ ] **Step 3: Add minimal CSS**

Style hunk button as a small bordered link-like button, and line-number links as subtle clickable numbers.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test tests/viewerServer.test.mjs`

Expected: pass.

### Task 4: Full Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused tests**

Run: `node --test tests/parseUnifiedDiff.test.mjs tests/prepareRun.test.mjs tests/viewerServer.test.mjs`

Expected: pass.

- [ ] **Step 2: Run full test suite**

Run: `npm test`

Expected: pass.

- [ ] **Step 3: Review diff**

Run: `git diff -- src/diff/parseUnifiedDiff.mjs src/run/prepareRun.mjs src/viewer/app.js src/viewer/styles.css tests/parseUnifiedDiff.test.mjs tests/prepareRun.test.mjs tests/viewerServer.test.mjs docs/superpowers/plans/2026-06-28-editor-open-vscode.md`

Expected: only scoped VS Code opener changes and this plan.
