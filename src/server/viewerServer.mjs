import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const viewerDir = join(dirname(fileURLToPath(import.meta.url)), "..", "viewer");
const vendorDir = join(viewerDir, "vendor");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

export async function startViewerServer({ workspaceDir, port = 0, host = "127.0.0.1" }) {
  const server = createServer((request, response) => {
    handleRequest({ request, response, workspaceDir }).catch(() => {
      sendStatus(response, 404);
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    port: server.address().port,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
}

async function handleRequest({ request, response, workspaceDir }) {
  if (request.method !== "GET") {
    sendStatus(response, 404);
    return;
  }

  const { pathname } = new URL(request.url, "http://localhost");

  if (pathname === "/health") {
    sendJson(response, { ok: true, app: "attention-diff-viewer", features: ["highlight-js"] });
    return;
  }

  if (pathname === "/" || /^\/runs\/[^/]+$/.test(pathname)) {
    await sendFile(response, join(viewerDir, "index.html"), contentTypes[".html"]);
    return;
  }

  if (pathname === "/app.js" || pathname === "/styles.css") {
    const ext = pathname.endsWith(".js") ? ".js" : ".css";
    await sendFile(response, join(viewerDir, pathname.slice(1)), contentTypes[ext]);
    return;
  }

  if (pathname === "/vendor/highlight.min.js") {
    await sendFile(response, join(vendorDir, "highlight.min.js"), contentTypes[".js"]);
    return;
  }

  const artifactMatch = pathname.match(
    /^\/api\/runs\/([^/]+)\/(diff\.json|attention\.json|validation\.json)$/
  );
  if (artifactMatch) {
    const [, runId, filename] = artifactMatch;
    await sendFile(
      response,
      join(workspaceDir, ".attention-diff", "runs", runId, filename),
      contentTypes[".json"]
    );
    return;
  }

  sendStatus(response, 404);
}

async function sendFile(response, path, contentType) {
  try {
    const body = await readFile(path);
    response.writeHead(200, { "content-type": contentType });
    response.end(body);
  } catch {
    sendStatus(response, 404);
  }
}

function sendStatus(response, statusCode) {
  response.writeHead(statusCode, { "content-type": "text/plain; charset=utf-8" });
  response.end(statusCode === 404 ? "Not Found\n" : "");
}

function sendJson(response, body) {
  response.writeHead(200, { "content-type": contentTypes[".json"] });
  response.end(`${JSON.stringify(body)}\n`);
}
