const app = document.querySelector("#app");
const subtitle = document.querySelector("#subtitle");
const unifiedButton = document.querySelector("#unifiedButton");
const splitButton = document.querySelector("#splitButton");
const themeSystemButton = document.querySelector("#themeSystemButton");
const themeLightButton = document.querySelector("#themeLightButton");
const themeDarkButton = document.querySelector("#themeDarkButton");
const THEME_STORAGE_KEY = "attention-diff-theme";
const THEME_OPTIONS = new Set(["system", "light", "dark"]);
const OPEN_TARGETS = {
  vscode: {
    label: "VS Code",
    createUrl(location) {
      return `vscode://file/${encodeURI(location.absolutePath)}:${location.line}:${location.column}`;
    }
  }
};
let currentThemePreference = "system";

function deriveRunId() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  const runIndex = parts.indexOf("runs");
  return runIndex >= 0 ? parts[runIndex + 1] : null;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function languageForPath(path) {
  const normalized = String(path ?? "").toLowerCase();
  const filename = normalized.split("/").pop() || "";
  const filenameLanguages = {
    dockerfile: "dockerfile",
    makefile: "makefile",
    "package-lock.json": "json",
    "pom.xml": "xml"
  };
  if (filenameLanguages[filename]) {
    return filenameLanguages[filename];
  }

  const extension = filename.includes(".") ? filename.split(".").pop() : "";
  const extensionLanguages = {
    bash: "bash",
    c: "c",
    cc: "cpp",
    cpp: "cpp",
    cs: "csharp",
    css: "css",
    diff: "diff",
    go: "go",
    gradle: "gradle",
    h: "cpp",
    html: "xml",
    java: "java",
    js: "javascript",
    json: "json",
    kt: "kotlin",
    less: "less",
    lua: "lua",
    md: "markdown",
    mjs: "javascript",
    php: "php",
    py: "python",
    rb: "ruby",
    rs: "rust",
    scss: "scss",
    sh: "bash",
    sql: "sql",
    ts: "typescript",
    tsx: "typescript",
    txt: "plaintext",
    xml: "xml",
    yaml: "yaml",
    yml: "yaml"
  };
  return extensionLanguages[extension] ?? "plaintext";
}

function highlightCode(code, filePath) {
  const highlighter = window.hljs;
  const language = languageForPath(filePath);
  if (!highlighter?.highlight || !highlighter?.getLanguage || !highlighter.getLanguage(language)) {
    return escapeHtml(code);
  }

  try {
    return highlighter.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

async function fetchJson(path, { optional = false } = {}) {
  const response = await fetch(path);
  if (!response.ok) {
    if (optional) {
      return null;
    }
    throw new Error(`${path} returned ${response.status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    if (optional) {
      return null;
    }
    throw error;
  }
}

function setViewMode(mode) {
  const split = mode === "split";
  document.body.classList.toggle("split-view", split);
  unifiedButton.classList.toggle("active", !split);
  splitButton.classList.toggle("active", split);
}

function getSystemTheme() {
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
}

function readThemePreference() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return THEME_OPTIONS.has(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function storeThemePreference(preference) {
  try {
    if (preference === "system") {
      localStorage.removeItem(THEME_STORAGE_KEY);
      return;
    }
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Theme persistence is optional; rendering should continue without storage.
  }
}

function updateThemeButtons(preference) {
  themeSystemButton.classList.toggle("active", preference === "system");
  themeLightButton.classList.toggle("active", preference === "light");
  themeDarkButton.classList.toggle("active", preference === "dark");
}

function applyThemePreference(preference) {
  const normalized = THEME_OPTIONS.has(preference) ? preference : "system";
  currentThemePreference = normalized;
  document.documentElement.dataset.themePreference = normalized;
  document.documentElement.dataset.theme = normalized === "system" ? getSystemTheme() : normalized;
  updateThemeButtons(normalized);
}

function setThemePreference(preference) {
  const normalized = THEME_OPTIONS.has(preference) ? preference : "system";
  storeThemePreference(normalized);
  applyThemePreference(normalized);
}

function setupThemeMode() {
  applyThemePreference(readThemePreference());
  themeSystemButton.addEventListener("click", () => setThemePreference("system"));
  themeLightButton.addEventListener("click", () => setThemePreference("light"));
  themeDarkButton.addEventListener("click", () => setThemePreference("dark"));

  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    ?.addEventListener?.("change", () => {
      if (currentThemePreference === "system") {
        applyThemePreference("system");
      }
    });
}

function indexAttention(attentionJson) {
  const files = new Map();
  const hunks = new Map();
  const lines = new Map();

  for (const file of attentionJson?.files || []) {
    files.set(file.fileId, file);
    for (const hunk of file.hunks || []) {
      hunks.set(hunk.hunkId, hunk);
      for (const group of hunk.attentionGroups || []) {
        for (const lineId of group.lineIds || []) {
          lines.set(lineId, group);
        }
      }
    }
  }

  return { files, hunks, lines };
}

function updateSubtitle(diffJson, runId, hasAttention) {
  const source = diffJson.source || {};
  const repo = source.repo ? source.repo : "unknown repo";
  const title = source.title ? source.title : runId;
  const suffix = hasAttention ? "" : " / attentionなし";
  subtitle.textContent = `${repo} - ${title}${suffix}`;
}

function renderSidebar(files, attentionIndex) {
  const links = files
    .map((file) => {
      const attention = attentionIndex.files.get(file.id)?.attention ?? "-";
      return `
        <a class="file-link" href="#${escapeHtml(file.id)}">
          <span class="file-path">${escapeHtml(file.path)}</span>
          <span class="score" title="file attention">${escapeHtml(attention)}</span>
        </a>
      `;
    })
    .join("");

  return `
    <aside class="sidebar">
      <h2>Files</h2>
      <nav class="file-nav">${links}</nav>
    </aside>
  `;
}

function renderReasonGrid(hunkAttention) {
  if (!hunkAttention) {
    return "";
  }

  const question = hunkAttention.question ?? "確認質問なし";
  return `
    <section class="reason-grid">
      <div class="reason">
        <span class="reason-label">レビュー理由</span>
        <p>${escapeHtml(hunkAttention.reviewReason)}</p>
      </div>
      <div class="reason">
        <span class="reason-label">軽く見てよい理由</span>
        <p>${escapeHtml(hunkAttention.skimReason)}</p>
      </div>
      <div class="reason">
        <span class="reason-label">確認質問</span>
        <p>${escapeHtml(question)}</p>
      </div>
    </section>
  `;
}

function markerForLine(line) {
  if (line.type === "add") {
    return "+";
  }
  if (line.type === "remove") {
    return "-";
  }
  return "";
}

function lineClasses(line, group) {
  const classes = ["line", line.type];
  if (group) {
    classes.push(group.kind, `attn-${group.attention}`);
    if (line.type === "add") {
      classes.push(`heat-add-${group.attention}`);
    }
    if (line.type === "remove") {
      classes.push(`heat-remove-${group.attention}`);
    }
  }
  return classes.join(" ");
}

function createLabelLineIds(lines, attentionIndex) {
  const seenGroupIds = new Set();
  const labelLineIds = new Set();

  for (const line of lines || []) {
    const group = attentionIndex.lines.get(line.id);
    if (!group || seenGroupIds.has(group.id)) {
      continue;
    }

    seenGroupIds.add(group.id);
    labelLineIds.add(line.id);
  }

  return labelLineIds;
}

function renderLabel(group, lineId, labelLineIds) {
  if (!group || !labelLineIds.has(lineId)) {
    return "";
  }
  return `<span class="label-chip" title="${escapeHtml(group.reason)}">${escapeHtml(group.label)}</span>`;
}

function isValidLineNumber(value) {
  return Number.isInteger(value) && value > 0;
}

function resolveLineTarget(lines, line) {
  if (isValidLineNumber(line?.newLine)) {
    return line.newLine;
  }

  const index = (lines || []).findIndex((candidate) => candidate?.id === line?.id);
  if (index < 0) {
    return null;
  }

  for (let offset = index + 1; offset < lines.length; offset += 1) {
    if (isValidLineNumber(lines[offset]?.newLine)) {
      return lines[offset].newLine;
    }
  }

  for (let offset = index - 1; offset >= 0; offset -= 1) {
    if (isValidLineNumber(lines[offset]?.newLine)) {
      return lines[offset].newLine;
    }
  }

  return null;
}

function resolveFileLocation(workspacePath, filePath, lineNumber) {
  if (
    typeof workspacePath !== "string" ||
    workspacePath.trim() === "" ||
    typeof filePath !== "string" ||
    filePath.trim() === "" ||
    filePath === "/dev/null" ||
    !isValidLineNumber(lineNumber)
  ) {
    return null;
  }

  const root = workspacePath.replace(/\/+$/, "");
  const relativePath = filePath.replace(/^\/+/, "");
  return {
    absolutePath: `${root}/${relativePath}`,
    line: lineNumber,
    column: 1
  };
}

function createOpenUrl(workspacePath, filePath, lineNumber, target = OPEN_TARGETS.vscode) {
  const location = resolveFileLocation(workspacePath, filePath, lineNumber);
  return location ? target.createUrl(location) : null;
}

function firstOpenableLine(lines) {
  for (const line of lines || []) {
    if (isValidLineNumber(line?.newLine)) {
      return line.newLine;
    }
  }
  return null;
}

function renderOpenEditorLink(hunk, filePath, workspacePath) {
  const lineNumber = firstOpenableLine(hunk.lines || []);
  const href = createOpenUrl(workspacePath, filePath, lineNumber);
  if (!href) {
    return "";
  }

  return `
    <a class="open-editor-link" href="${escapeHtml(href)}" title="${escapeHtml(`${filePath}:${lineNumber} を ${OPEN_TARGETS.vscode.label} で開く`)}">
      ${escapeHtml(`${OPEN_TARGETS.vscode.label}で開く`)}
    </a>
  `;
}

function renderHunkHeader(hunk, filePath, workspacePath) {
  return `
    <div class="hunk-header">
      <span class="hunk-title">${escapeHtml(hunk.header)}</span>
      ${renderOpenEditorLink(hunk, filePath, workspacePath)}
    </div>
  `;
}

function renderLineNumber(value, href) {
  if (!href || value === null || value === undefined) {
    return escapeHtml(value ?? "");
  }

  return `<a class="line-number-link" href="${escapeHtml(href)}" title="${escapeHtml(`${OPEN_TARGETS.vscode.label}で開く`)}">${escapeHtml(value)}</a>`;
}

function renderUnifiedLine(line, attentionIndex, labelLineIds, filePath, hunkLines, workspacePath) {
  const group = attentionIndex.lines.get(line.id);
  const href = createOpenUrl(workspacePath, filePath, resolveLineTarget(hunkLines, line));
  return `
    <tr class="${lineClasses(line, group)}">
      <td class="line-number">${renderLineNumber(line.oldLine, href)}</td>
      <td class="line-number">${renderLineNumber(line.newLine, href)}</td>
      <td class="marker">${escapeHtml(markerForLine(line))}</td>
      <td class="code">${highlightCode(line.content, filePath)}</td>
      <td class="label-cell">${renderLabel(group, line.id, labelLineIds)}</td>
    </tr>
  `;
}

function createSplitRows(lines) {
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.type === "remove" && lines[index + 1]?.type === "add") {
      rows.push({ left: line, right: lines[index + 1] });
      index += 1;
      continue;
    }

    if (line.type === "add") {
      rows.push({ left: null, right: line });
      continue;
    }

    if (line.type === "remove") {
      rows.push({ left: line, right: null });
      continue;
    }

    rows.push({ left: line, right: line });
  }
  return rows;
}

function renderSplitSide(line, attentionIndex, side, labelLineIds, filePath, hunkLines, workspacePath) {
  if (!line) {
    return `
      <td class="line-number"></td>
      <td class="marker"></td>
      <td class="code split-code"></td>
      <td class="label-cell"></td>
    `;
  }

  const group = attentionIndex.lines.get(line.id);
  const lineNumber = side === "old" ? line.oldLine : line.newLine;
  const href = createOpenUrl(workspacePath, filePath, resolveLineTarget(hunkLines, line));
  const classes = lineClasses(line, group);
  return `
    <td class="line-number">${renderLineNumber(lineNumber, href)}</td>
    <td class="marker">${escapeHtml(markerForLine(line))}</td>
    <td class="code split-code ${classes}">${highlightCode(line.content, filePath)}</td>
    <td class="label-cell ${classes}">${renderLabel(group, line.id, labelLineIds)}</td>
  `;
}

function renderSplitRow(row, attentionIndex, labelLineIds, filePath, hunkLines, workspacePath) {
  return `
    <tr class="split-row">
      ${renderSplitSide(row.left, attentionIndex, "old", labelLineIds, filePath, hunkLines, workspacePath)}
      ${renderSplitSide(row.right, attentionIndex, "new", labelLineIds, filePath, hunkLines, workspacePath)}
    </tr>
  `;
}

function renderHunk(hunk, attentionIndex, filePath, workspacePath) {
  const hunkAttention = attentionIndex.hunks.get(hunk.id);
  const labelLineIds = createLabelLineIds(hunk.lines || [], attentionIndex);
  const unifiedRows = (hunk.lines || [])
    .map((line) =>
      renderUnifiedLine(line, attentionIndex, labelLineIds, filePath, hunk.lines || [], workspacePath)
    )
    .join("");
  const splitRows = createSplitRows(hunk.lines || [])
    .map((row) =>
      renderSplitRow(row, attentionIndex, labelLineIds, filePath, hunk.lines || [], workspacePath)
    )
    .join("");

  return `
    <section class="hunk">
      ${renderHunkHeader(hunk, filePath, workspacePath)}
      ${renderReasonGrid(hunkAttention)}
      <table class="diff-table unified-diff-table">
        <tbody>${unifiedRows}</tbody>
      </table>
      <table class="diff-table split-diff-table">
        <tbody>${splitRows}</tbody>
      </table>
    </section>
  `;
}

function renderFile(file, attentionIndex, workspacePath) {
  const hunkHtml = (file.hunks || [])
    .map((hunk) => renderHunk(hunk, attentionIndex, file.path, workspacePath))
    .join("");
  const meta = `${file.status} / +${file.additions} -${file.deletions}`;

  return `
    <article class="file-section" id="${escapeHtml(file.id)}">
      <header class="file-header">
        <h3>${escapeHtml(file.path)}</h3>
        <span class="file-meta">${escapeHtml(meta)}</span>
      </header>
      ${hunkHtml}
    </article>
  `;
}

function renderDiff(diffJson, attentionJson) {
  const attentionIndex = indexAttention(attentionJson);
  const files = diffJson.files || [];
  const workspacePath = diffJson.source?.workspacePath;
  const sidebar = renderSidebar(files, attentionIndex);
  const content = files.map((file) => renderFile(file, attentionIndex, workspacePath)).join("");

  app.innerHTML = `
    ${sidebar}
    <section class="content">
      <h2>Diff</h2>
      ${content || '<div class="status">表示できる差分がありません。</div>'}
    </section>
  `;
}

function renderValidationWarning() {
  return `
    <div class="status">
      attention ignored because validation failed.
    </div>
  `;
}

async function main() {
  const runId = deriveRunId();
  if (!runId) {
    app.innerHTML = '<div class="status">runId を URL から取得できません。</div>';
    return;
  }

  try {
    const diffJson = await fetchJson(`/api/runs/${encodeURIComponent(runId)}/diff.json`);
    const validationJson = await fetchJson(
      `/api/runs/${encodeURIComponent(runId)}/validation.json`,
      { optional: true }
    );
    const validationFailed = validationJson && validationJson.valid !== true;
    const usableAttentionJson = validationFailed
      ? null
      : await fetchJson(
        `/api/runs/${encodeURIComponent(runId)}/attention.json`,
        { optional: true }
      );

    updateSubtitle(diffJson, runId, Boolean(usableAttentionJson));
    renderDiff(diffJson, usableAttentionJson);
    if (validationFailed) {
      app.querySelector(".content").insertAdjacentHTML("afterbegin", renderValidationWarning());
    }
  } catch (error) {
    app.innerHTML = `<div class="status">viewer の読み込みに失敗しました: ${escapeHtml(error.message)}</div>`;
  }
}

unifiedButton.addEventListener("click", () => setViewMode("unified"));
splitButton.addEventListener("click", () => setViewMode("split"));
setupThemeMode();
setViewMode("unified");
main();
