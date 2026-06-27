import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import vm from "node:vm";
import { startViewerServer } from "../src/server/viewerServer.mjs";

test("viewer server serves run page and run artifacts", async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), "attention-diff-"));
  const runId = "pr-190-def4567-a1b2c3d4";
  const runDir = join(workspaceDir, ".attention-diff", "runs", runId);

  await mkdir(runDir, { recursive: true });
  await writeFile(
    join(runDir, "diff.json"),
    JSON.stringify({ schemaVersion: "0.1", diffId: "sha256:test", files: [] })
  );
  await writeFile(
    join(runDir, "attention.json"),
    JSON.stringify({ schemaVersion: "0.1", targetDiffId: "sha256:test", files: [] })
  );

  let server;
  try {
    server = await startViewerServer({ workspaceDir, port: 0 });

    const pageResponse = await fetch(`http://127.0.0.1:${server.port}/runs/${runId}`);
    assert.equal(pageResponse.status, 200);
    const html = await pageResponse.text();
    assert.match(html, /Attention Diff/);

    const healthResponse = await fetch(`http://127.0.0.1:${server.port}/health`);
    assert.equal(healthResponse.status, 200);
    const healthJson = await healthResponse.json();
    assert.deepEqual(healthJson.features, ["highlight-js"]);

    const scriptResponse = await fetch(`http://127.0.0.1:${server.port}/app.js`);
    assert.equal(scriptResponse.status, 200);
    assert.match(scriptResponse.headers.get("content-type"), /^text\/javascript/);

    const stylesResponse = await fetch(`http://127.0.0.1:${server.port}/styles.css`);
    assert.equal(stylesResponse.status, 200);
    assert.match(stylesResponse.headers.get("content-type"), /^text\/css/);

    const highlightResponse = await fetch(
      `http://127.0.0.1:${server.port}/vendor/highlight.min.js`
    );
    assert.equal(highlightResponse.status, 200);
    assert.match(highlightResponse.headers.get("content-type"), /^text\/javascript/);
    assert.match(await highlightResponse.text(), /hljs/);

    const diffResponse = await fetch(
      `http://127.0.0.1:${server.port}/api/runs/${runId}/diff.json`
    );
    assert.equal(diffResponse.status, 200);
    const diffJson = await diffResponse.json();
    assert.equal(diffJson.diffId, "sha256:test");
  } finally {
    if (server) {
      await server.close();
    }
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("serve script reuses an alive workspace viewer server", async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), "attention-diff-"));
  const first = spawnServe(workspaceDir, "run-one");

  try {
    const firstUrl = await waitForStdoutLine(first);
    assert.match(firstUrl, /^http:\/\/localhost:\d+\/runs\/run-one$/);

    const serverJson = JSON.parse(
      await readFile(join(workspaceDir, ".attention-diff", "server.json"), "utf8")
    );
    assert.equal(serverJson.pid, first.child.pid);
    assert.equal(serverJson.host, "127.0.0.1");
    assert.equal(Number.isInteger(serverJson.port), true);

    const second = await runServeCommand(workspaceDir, "run-two");

    assert.equal(second.timedOut, false);
    assert.equal(second.code, 0);
    assert.equal(second.stderr, "");
    assert.equal(second.stdout.trim(), `http://localhost:${serverJson.port}/runs/run-two`);
  } finally {
    await stopServe(first);
    await rm(workspaceDir, { recursive: true, force: true });
  }
});

test("viewer shell references static assets and app includes attention view behavior", async () => {
  const html = await readFile("src/viewer/index.html", "utf8");
  const app = await readFile("src/viewer/app.js", "utf8");

  assert.match(html, /href="\/styles\.css"/);
  assert.match(html, /src="\/vendor\/highlight\.min\.js"/);
  assert.match(html, /src="\/app\.js"/);
  assert.match(html, /id="themeSystemButton"/);
  assert.match(html, /id="themeLightButton"/);
  assert.match(html, /id="themeDarkButton"/);
  assert.match(app, /split-view/);
  assert.match(app, /attentionGroups/);
  assert.match(app, /escapeHtml/);
  assert.match(app, /highlightCode/);
  assert.match(app, /attention-diff-theme/);
  assert.match(app, /prefers-color-scheme: dark/);
});

test("viewer styles color unscored changed rows with base red and green backgrounds", async () => {
  const styles = await readFile("src/viewer/styles.css", "utf8");

  assert.match(styles, /\.line\.add \.code,\n\.code\.add \{/);
  assert.match(styles, /background: var\(--add-1\);/);
  assert.match(styles, /\.line\.remove \.code,\n\.code\.remove \{/);
  assert.match(styles, /background: var\(--remove-1\);/);
});

test("viewer styles preserve muted syntax color categories on changed heat rows", async () => {
  const styles = await readFile("src/viewer/styles.css", "utf8");

  assert.match(styles, /--syntax-heat-keyword:/);
  assert.match(styles, /--syntax-heat-string:/);
  assert.match(styles, /--syntax-heat-number:/);
  assert.match(styles, /--syntax-heat-title:/);
  assert.match(styles, /--syntax-heat-comment:/);
  assert.match(styles, /\.line\.(add|remove) \.code \.hljs-keyword,/);
  assert.match(styles, /\.code\.(add|remove) \.hljs-keyword/);
  assert.match(styles, /color: var\(--syntax-heat-keyword\);/);
  assert.match(styles, /color: var\(--syntax-heat-string\);/);
  assert.match(styles, /color: var\(--syntax-heat-number\);/);
  assert.match(styles, /color: var\(--syntax-heat-title\);/);
  assert.match(styles, /color: var\(--syntax-heat-comment\);/);
});

test("viewer app renders fixed reason labels in Japanese", async () => {
  const app = await readFile("src/viewer/app.js", "utf8");

  assert.match(app, /レビュー理由/);
  assert.match(app, /軽く見てよい理由/);
  assert.match(app, /確認質問/);
});

test("viewer app ignores attention when validation failed", async () => {
  const app = await readFile("src/viewer/app.js", "utf8");

  assert.match(app, /validation\.json/);
  assert.match(app, /valid !== true/);
  assert.match(app, /validation failed/);
});

test("viewer app falls back to plain diff when invalid validation has malformed attention", async () => {
  const script = await readFile("src/viewer/app.js", "utf8");
  const { app, calls, context } = createViewerVmContext({
    diffJson: {
      source: { repo: "example/repo", title: "Example PR" },
      files: [
        {
          id: "file_0001",
          path: "src/example.js",
          status: "modified",
          additions: 1,
          deletions: 0,
          hunks: [
            {
              id: "file_0001_hunk_0001",
              header: "@@ -1 +1 @@",
              lines: [
                {
                  id: "file_0001_hunk_0001_line_0001",
                  type: "add",
                  oldLine: null,
                  newLine: 1,
                  content: "changed"
                }
              ]
            }
          ]
        }
      ]
    },
    attentionJson: new Error("malformed attention"),
    validationJson: { valid: false, errors: ["bad attention"], warnings: [] }
  });

  vm.createContext(context);
  vm.runInContext(script, context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.match(calls.warning, /validation failed/);
  assert.equal(calls.subtitle, "example/repo - Example PR / attentionなし");
  assert.doesNotMatch(app.innerHTML, /viewer の読み込みに失敗しました/);
  assert.doesNotMatch(app.innerHTML, /heat-5/);
});

test("split rows keep attention classes on side-specific cells only", async () => {
  const app = await readFile("src/viewer/app.js", "utf8");

  assert.match(app, /class="split-row"/);
  assert.doesNotMatch(app, /\$\{leftClasses\} \$\{rightClasses\}/);
});

test("viewer app renders one label chip per attention group in each diff view", async () => {
  const script = await readFile("src/viewer/app.js", "utf8");
  const { app, context } = createViewerVmContext({
    diffJson: {
      source: { repo: "example/repo", title: "Example PR" },
      files: [
        {
          id: "file_0001",
          path: "src/example.js",
          status: "modified",
          additions: 2,
          deletions: 0,
          hunks: [
            {
              id: "file_0001_hunk_0001",
              header: "@@ -1,2 +1,2 @@",
              lines: [
                {
                  id: "file_0001_hunk_0001_line_0001",
                  type: "add",
                  oldLine: null,
                  newLine: 1,
                  content: "first changed line"
                },
                {
                  id: "file_0001_hunk_0001_line_0002",
                  type: "add",
                  oldLine: null,
                  newLine: 2,
                  content: "second changed line"
                }
              ]
            }
          ]
        }
      ]
    },
    attentionJson: {
      files: [
        {
          fileId: "file_0001",
          attention: 3,
          hunks: [
            {
              hunkId: "file_0001_hunk_0001",
              attention: 3,
              reviewReason: "通常レビューとして確認する。",
              skimReason: "繰り返しの形は軽く見てよい。",
              question: null,
              attentionGroups: [
                {
                  id: "file_0001_hunk_0001_group_0001",
                  kind: "highlighted",
                  attention: 3,
                  lineIds: [
                    "file_0001_hunk_0001_line_0001",
                    "file_0001_hunk_0001_line_0002"
                  ],
                  label: "同じ指摘",
                  reason: "同じ理由で確認する。"
                }
              ]
            }
          ]
        }
      ]
    },
    validationJson: { valid: true, errors: [], warnings: [] }
  });

  vm.createContext(context);
  vm.runInContext(script, context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal((app.innerHTML.match(/同じ指摘/g) || []).length, 2);
  assert.match(app.innerHTML, /heat-add-3/);
});

test("viewer app syntax-highlights code using language inferred from file path", async () => {
  const script = await readFile("src/viewer/app.js", "utf8");
  const highlightCalls = [];
  const { app, context } = createViewerVmContext({
    diffJson: {
      source: { repo: "example/repo", title: "Example PR" },
      files: [
        {
          id: "file_0001",
          path: "src/main/java/example/Example.java",
          status: "modified",
          additions: 1,
          deletions: 0,
          hunks: [
            {
              id: "file_0001_hunk_0001",
              header: "@@ -1 +1 @@",
              lines: [
                {
                  id: "file_0001_hunk_0001_line_0001",
                  type: "add",
                  oldLine: null,
                  newLine: 1,
                  content: "public class Example {}"
                }
              ]
            }
          ]
        }
      ]
    },
    attentionJson: { files: [] },
    validationJson: { valid: true, errors: [], warnings: [] },
    hljs: {
      getLanguage(language) {
        return language === "java";
      },
      highlight(code, options) {
        highlightCalls.push({ code, options });
        return {
          value: '<span class="hljs-keyword">public</span> class Example {}'
        };
      }
    }
  });

  vm.createContext(context);
  vm.runInContext(script, context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(highlightCalls.length, 2);
  assert.deepEqual(new Set(highlightCalls.map((call) => call.options.language)), new Set(["java"]));
  assert.equal(
    highlightCalls.every((call) => call.code === "public class Example {}"),
    true
  );
  assert.equal(
    highlightCalls.every((call) => call.options.ignoreIllegals === true),
    true
  );
  assert.match(app.innerHTML, /<span class="hljs-keyword">public<\/span>/);
});

test("viewer app follows browser dark theme by default", async () => {
  const script = await readFile("src/viewer/app.js", "utf8");
  const { context, documentElement, buttons, storage } = createViewerVmContext({
    diffJson: { source: { repo: "example/repo", title: "Example PR" }, files: [] },
    attentionJson: { files: [] },
    validationJson: { valid: true, errors: [], warnings: [] },
    systemDark: true
  });

  vm.createContext(context);
  vm.runInContext(script, context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(documentElement.dataset.themePreference, "system");
  assert.equal(documentElement.dataset.theme, "dark");
  assert.equal(buttons.themeSystem.classList.has("active"), true);
  assert.equal(storage.get("attention-diff-theme"), undefined);
});

test("viewer app stores manual theme and overrides browser preference", async () => {
  const script = await readFile("src/viewer/app.js", "utf8");
  const { context, documentElement, buttons, storage } = createViewerVmContext({
    diffJson: { source: { repo: "example/repo", title: "Example PR" }, files: [] },
    attentionJson: { files: [] },
    validationJson: { valid: true, errors: [], warnings: [] },
    systemDark: true
  });

  vm.createContext(context);
  vm.runInContext(script, context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  buttons.themeLight.click();

  assert.equal(storage.get("attention-diff-theme"), "light");
  assert.equal(documentElement.dataset.themePreference, "light");
  assert.equal(documentElement.dataset.theme, "light");
  assert.equal(buttons.themeLight.classList.has("active"), true);
  assert.equal(buttons.themeSystem.classList.has("active"), false);
});

test("viewer app restores saved manual theme on load", async () => {
  const script = await readFile("src/viewer/app.js", "utf8");
  const { context, documentElement, buttons } = createViewerVmContext({
    diffJson: { source: { repo: "example/repo", title: "Example PR" }, files: [] },
    attentionJson: { files: [] },
    validationJson: { valid: true, errors: [], warnings: [] },
    systemDark: false,
    storedTheme: "dark"
  });

  vm.createContext(context);
  vm.runInContext(script, context);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(documentElement.dataset.themePreference, "dark");
  assert.equal(documentElement.dataset.theme, "dark");
  assert.equal(buttons.themeDark.classList.has("active"), true);
  assert.equal(buttons.themeSystem.classList.has("active"), false);
});

function createViewerVmContext({
  diffJson,
  attentionJson,
  validationJson,
  hljs = null,
  systemDark = false,
  storedTheme = null
}) {
  const calls = { warning: "", subtitle: "" };
  const app = {
    innerHTML: "",
    querySelector(selector) {
      assert.equal(selector, ".content");
      return {
        insertAdjacentHTML(_where, html) {
          calls.warning = html;
        }
      };
    }
  };
  const bodyClassList = createClassList();
  const documentElement = { dataset: {} };
  const buttons = {
    unified: createButton(),
    split: createButton(),
    themeSystem: createButton(),
    themeLight: createButton(),
    themeDark: createButton()
  };
  const subtitle = {
    set textContent(value) {
      calls.subtitle = value;
    }
  };
  const storage = new Map();
  if (storedTheme) {
    storage.set("attention-diff-theme", storedTheme);
  }

  const context = {
    document: {
      documentElement,
      body: { classList: bodyClassList },
      querySelector(selector) {
        if (selector === "#app") {
          return app;
        }
        if (selector === "#subtitle") {
          return subtitle;
        }
        if (selector === "#unifiedButton") {
          return buttons.unified;
        }
        if (selector === "#splitButton") {
          return buttons.split;
        }
        if (selector === "#themeSystemButton") {
          return buttons.themeSystem;
        }
        if (selector === "#themeLightButton") {
          return buttons.themeLight;
        }
        if (selector === "#themeDarkButton") {
          return buttons.themeDark;
        }
        throw new Error(`unexpected selector ${selector}`);
      }
    },
    window: {
      location: { pathname: "/runs/test-run" },
      hljs,
      matchMedia(query) {
        assert.equal(query, "(prefers-color-scheme: dark)");
        return {
          matches: systemDark,
          addEventListener() {}
        };
      }
    },
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      },
      removeItem(key) {
        storage.delete(key);
      }
    },
    fetch: async (path) => ({
      ok: true,
      json: async () => {
        if (path.endsWith("/diff.json")) {
          return diffJson;
        }
        if (path.endsWith("/validation.json")) {
          return validationJson;
        }
        if (path.endsWith("/attention.json")) {
          if (attentionJson instanceof Error) {
            throw attentionJson;
          }
          return attentionJson;
        }
        throw new Error(`unexpected path ${path}`);
      }
    })
  };

  return { app, buttons, calls, context, documentElement, storage };
}

function createClassList() {
  const classes = new Set();
  return {
    has(className) {
      return classes.has(className);
    },
    toggle(className, force) {
      if (force === false) {
        classes.delete(className);
        return false;
      }
      if (force === true) {
        classes.add(className);
        return true;
      }
      if (classes.has(className)) {
        classes.delete(className);
        return false;
      }
      classes.add(className);
      return true;
    }
  };
}

function createButton() {
  const handlers = new Map();
  return {
    classList: createClassList(),
    addEventListener(eventName, handler) {
      handlers.set(eventName, handler);
    },
    click() {
      handlers.get("click")?.();
    }
  };
}

function spawnServe(workspaceDir, runId) {
  const child = spawn(process.execPath, [join(process.cwd(), "scripts/attention-diff-serve.mjs"), runId], {
    cwd: workspaceDir,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const output = { stdout: "", stderr: "" };
  const closePromise = new Promise((resolve) => {
    child.on("close", (code) => {
      resolve(code);
    });
  });

  child.stdout.on("data", (chunk) => {
    output.stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output.stderr += chunk;
  });

  return { child, closePromise, output };
}

async function waitForStdoutLine(processInfo) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const line = processInfo.output.stdout.split(/\r?\n/).find(Boolean);
    if (line) {
      return line;
    }
    await delay(20);
  }

  throw new Error(`serve script did not print a URL. stderr: ${processInfo.output.stderr}`);
}

async function runServeCommand(workspaceDir, runId) {
  const processInfo = spawnServe(workspaceDir, runId);
  const completed = processInfo.closePromise.then((code) => ({
    code,
    timedOut: false,
    stdout: processInfo.output.stdout,
    stderr: processInfo.output.stderr
  }));
  const timedOut = delay(1000).then(async () => {
    await stopServe(processInfo);
    return {
      code: null,
      timedOut: true,
      stdout: processInfo.output.stdout,
      stderr: processInfo.output.stderr
    };
  });

  return Promise.race([completed, timedOut]);
}

async function stopServe(processInfo) {
  if (!processInfo || processInfo.child.exitCode !== null) {
    return;
  }

  processInfo.child.kill("SIGTERM");
  await Promise.race([processInfo.closePromise, delay(1000)]);
}
