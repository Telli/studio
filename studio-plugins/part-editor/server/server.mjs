#!/usr/bin/env node
/**
 * Studio's part editor for text-to-cad parts: the part script stays the source, and the editor
 * reads it as a design. A warm tracer (../tracer/tracer.py, run in cadgen's Python) runs the script
 * with its numbers traced and its build123d operations recorded, and gives the editor the part's
 * timeline, named sizes and dimensions. A hand edit is one number changed in the source; then every
 * part script that uses the changed file is built again as text-to-cad builds it, so its STEP (and
 * Studio's viewer and checks) follow.
 *
 * The plugin host runs this once per thread. `part_editor_open` opens the editor beside the thread
 * (the agent's tool and the panel's + menu); `part_editor_file` opens it on a part script. The
 * page's own calls are app-only: `part_list`, `part_state`, `part_edit`.
 *
 * Usage: server.mjs --python <cadgen's python>
 */
import * as NodeChildProcess from "node:child_process";
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeReadline from "node:readline";
import * as NodeURL from "node:url";

const here = NodePath.dirname(NodeURL.fileURLToPath(import.meta.url));
const EDITOR_URI = "ui://part-editor/editor";
const EDITOR_FILE = NodePath.join(here, "..", "editor", "editor.html");
const MCP_APP_MIME = "text/html;profile=mcp-app";
const RESOURCE_META = {
  ui: {
    prefersBorder: false,
    csp: { connectDomains: ["data:", "blob:"], resourceDomains: ["data:", "blob:"] },
  },
};
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
};
const python = option("--python");
if (!python) {
  process.stderr.write("part editor: --python <cadgen's python> is required\n");
  process.exit(2);
}

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

// ---------------------------------------------------------------------------------------------
// The thread's folder, from the host's roots.

let root = null;
let next = 0;
const waiting = new Map();
function hostRequest(method, params) {
  const id = `part-${(next += 1)}`;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    send({ jsonrpc: "2.0", id, method, params });
  });
}
async function workspace() {
  if (root !== null) return root;
  try {
    // A host that never answers leaves the part's own folder as the project.
    const { roots } = await Promise.race([
      hostRequest("roots/list", {}),
      new Promise((_, reject) => setTimeout(() => reject(new Error("no roots")), 5000)),
    ]);
    const uri = roots?.[0]?.uri;
    if (typeof uri === "string" && uri.startsWith("file://")) root = NodeURL.fileURLToPath(uri);
  } catch {
    // Without roots, the part's own folder is the project.
  }
  return root;
}

// ---------------------------------------------------------------------------------------------
// The warm tracer: one request at a time, as it holds one Python process.

let tracer = null;
let queue = Promise.resolve();
const replies = new Map();
let tracerId = 0;
function startTracer() {
  tracer = NodeChildProcess.spawn(
    python,
    [NodePath.join(here, "..", "tracer", "tracer.py"), "--serve"],
    {
      stdio: ["pipe", "pipe", "inherit"],
    },
  );
  NodeReadline.createInterface({ input: tracer.stdout }).on("line", (line) => {
    let reply;
    try {
      reply = JSON.parse(line);
    } catch {
      return;
    }
    replies.get(reply.id)?.(reply);
    replies.delete(reply.id);
  });
  tracer.on("exit", () => {
    tracer = null;
    for (const resolve of replies.values())
      resolve({ ok: false, error: "The part tracer stopped." });
    replies.clear();
  });
}
function trace(request) {
  const run = () =>
    new Promise((resolve) => {
      if (tracer === null) startTracer();
      const id = (tracerId += 1);
      replies.set(id, resolve);
      tracer.stdin.write(`${JSON.stringify({ ...request, id })}\n`);
    });
  const result = queue.then(run);
  queue = result.catch(() => {});
  return result;
}

// ---------------------------------------------------------------------------------------------
// Part scripts, and building them again after an edit.

const SKIP = /^(\.|node_modules$|__pycache__$|tmp$|dist$|build$|vendor$)/;
function pythonFiles(dir, out = []) {
  let entries = [];
  try {
    entries = NodeFS.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.test(entry.name)) continue;
    const full = NodePath.join(dir, entry.name);
    if (entry.isDirectory()) pythonFiles(full, out);
    else if (entry.name.endsWith(".py")) out.push(full);
  }
  return out;
}
const isPart = (file) => /^\s*@step\b/m.test(NodeFS.readFileSync(file, "utf8"));

async function parts() {
  const base = await workspace();
  if (base === null) return [];
  return pythonFiles(base)
    .filter(isPart)
    .map((file) => ({
      script: file,
      path: NodePath.relative(base, file),
      name: NodePath.basename(file, ".py"),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Every part script that uses `changed` (a file relative to the project), directly or through others. */
async function dependents(changed) {
  const base = await workspace();
  if (base === null) return [];
  const files = pythonFiles(base);
  const module = (file) => NodePath.basename(file, ".py");
  const uses = new Map(
    files.map((file) => {
      const source = NodeFS.readFileSync(file, "utf8");
      const imported = new Set(
        [...source.matchAll(/^\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/gm)].map((m) =>
          (m[1] ?? m[2]).split(".").pop(),
        ),
      );
      return [file, imported];
    }),
  );
  const touched = new Set([NodePath.resolve(base, changed)]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [file, imported] of uses) {
      if (touched.has(file)) continue;
      if ([...touched].some((each) => imported.has(module(each)))) {
        touched.add(file);
        grew = true;
      }
    }
  }
  return [...touched].filter((file) => files.includes(file) && isPart(file));
}

let building = { scripts: [], done: 0, error: null };
let buildQueue = Promise.resolve();
function rebuild(scripts) {
  // Parts first, assemblies (which import parts) after.
  const ordered = [...scripts].sort(
    (a, b) => Number(/assembl/i.test(a)) - Number(/assembl/i.test(b)),
  );
  building = { scripts: ordered.map((script) => NodePath.basename(script)), done: 0, error: null };
  buildQueue = buildQueue.then(async () => {
    for (const script of ordered) {
      await new Promise((resolve) => {
        const child = NodeChildProcess.spawn(python, [script], {
          cwd: NodePath.dirname(script),
          stdio: ["ignore", "ignore", "pipe"],
        });
        let errors = "";
        child.stderr.on("data", (chunk) => (errors += chunk));
        child.on("exit", (code) => {
          if (code !== 0)
            building.error = `${NodePath.basename(script)}: ${errors.trim().split("\n").slice(-2).join(" ")}`;
          building.done += 1;
          resolve();
        });
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Tools.

const TOOLS = [
  {
    name: "part_editor_open",
    title: "Part editor",
    description:
      "Shows a text-to-cad part in Studio's part editor beside the thread, where the engineer changes its sizes and dimensions by hand; each change is one number edited in the part's script. `path`: the part's script (.py) or its STEP.",
    inputSchema: { type: "object", properties: { path: { type: "string" } } },
    _meta: { ui: { resourceUri: EDITOR_URI }, "openai/ui": { entrypoints: [{ type: "thread" }] } },
  },
  {
    name: "part_editor_file",
    title: "Part editor",
    description: "Studio's part editor, opened on a part script.",
    inputSchema: {
      type: "object",
      properties: {
        file: {
          type: "object",
          properties: { name: { type: "string" }, resourceUri: { type: "string" } },
        },
      },
    },
    _meta: {
      ui: { resourceUri: EDITOR_URI, visibility: ["app"] },
      "openai/ui": { entrypoints: [{ type: "file", extensions: ["py"] }] },
    },
  },
  ...["part_list", "part_state", "part_edit"].map((name) => ({
    name,
    description: `Studio's part editor: ${name.replace("part_", "")}.`,
    inputSchema: { type: "object", properties: {} },
    _meta: { ui: { visibility: ["app"] } },
  })),
];

function hashOf(file) {
  try {
    return NodeCrypto.createHash("sha256")
      .update(NodeFS.readFileSync(file))
      .digest("hex")
      .slice(0, 16);
  } catch {
    return null;
  }
}

/** The part script a path names: the script itself, or the script beside a STEP of the same name. */
async function scriptFor(file) {
  if (typeof file !== "string" || file.length === 0) return null;
  const base = await workspace();
  const full = NodePath.isAbsolute(file) ? file : NodePath.resolve(base ?? process.cwd(), file);
  const script = full.replace(/\.(step|stp|glb|stl)$/i, ".py");
  return NodeFS.existsSync(script) ? script : null;
}

function fileArgument(args, meta) {
  const fromMeta = meta?.["openai/resource"]?.path;
  if (typeof fromMeta === "string" && fromMeta.length > 0) return fromMeta;
  const uri = args?.file?.resourceUri;
  if (typeof uri === "string" && uri.startsWith("file://")) return NodeURL.fileURLToPath(uri);
  return typeof args?.path === "string" ? args.path : null;
}

async function call(name, args, meta) {
  switch (name) {
    case "part_editor_open":
    case "part_editor_file": {
      const script = await scriptFor(fileArgument(args, meta));
      const text =
        script === null
          ? "Showing the part editor."
          : `Showing ${NodePath.basename(script)} in the part editor.`;
      return { content: [{ type: "text", text }], structuredContent: { script } };
    }
    case "part_list":
      return { content: [], structuredContent: { parts: await parts(), root: await workspace() } };
    case "part_state": {
      const script = await scriptFor(args.script);
      if (script === null)
        return { content: [], structuredContent: { ok: false, error: "No such part." } };
      // The page asks every second and a half; it is traced again only when one of its files changed.
      if (args.files && Object.keys(args.files).length > 0) {
        const base = (await workspace()) ?? NodePath.dirname(script);
        const same = Object.entries(args.files).every(
          ([rel, hash]) => hashOf(NodePath.resolve(base, rel)) === hash,
        );
        if (same) return { content: [], structuredContent: { unchanged: true, building } };
      }
      const state = await trace({ script, root: (await workspace()) ?? NodePath.dirname(script) });
      return { content: [], structuredContent: { ...state, building } };
    }
    case "part_edit": {
      const script = await scriptFor(args.script);
      if (script === null)
        return { content: [], structuredContent: { ok: false, error: "No such part." } };
      const state = await trace({
        ...args,
        script,
        op: "edit",
        root: (await workspace()) ?? NodePath.dirname(script),
      });
      if (state.ok && state.change) rebuild(await dependents(state.change.file));
      return { content: [], structuredContent: { ...state, building } };
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

function editorResource() {
  let text;
  try {
    text = NodeFS.readFileSync(EDITOR_FILE, "utf8");
  } catch {
    text =
      "<!doctype html><p style='font-family:sans-serif'>The part editor is not built. Restart Studio.</p>";
  }
  return { uri: EDITOR_URI, mimeType: MCP_APP_MIME, text, _meta: RESOURCE_META };
}

// ---------------------------------------------------------------------------------------------
// MCP over stdio.

const INSTRUCTIONS =
  "Studio's part editor shows a text-to-cad part beside the thread, where the engineer changes its sizes by hand. After you make or change a part, call `part_editor_open` with its script so they can see it. Their hand edits are ordinary edits to the part's script: read the script again before you change it, and keep their values.";

async function answer(id, work) {
  try {
    send({ jsonrpc: "2.0", id, result: await work() });
  } catch (error) {
    send({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: String(error.message ?? error) }], isError: true },
    });
  }
}

NodeReadline.createInterface({ input: process.stdin }).on("line", (line) => {
  if (line.trim() === "") return;
  const message = JSON.parse(line);
  if (message.method === undefined && message.id !== undefined) {
    const pending = waiting.get(message.id);
    waiting.delete(message.id);
    if (message.error) pending?.reject(new Error(message.error.message));
    else pending?.resolve(message.result);
    return;
  }
  if (message.id === undefined) return; // notifications
  const { id, method, params } = message;
  switch (method) {
    case "initialize":
      send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "part-editor", title: "Part editor", version: "0.1.0" },
          instructions: INSTRUCTIONS,
        },
      });
      return;
    case "ping":
      send({ jsonrpc: "2.0", id, result: {} });
      return;
    case "tools/list":
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
      return;
    case "tools/call":
      void answer(id, () => call(params?.name, params?.arguments ?? {}, params?._meta));
      return;
    case "resources/list":
      send({
        jsonrpc: "2.0",
        id,
        result: {
          resources: [
            { uri: EDITOR_URI, name: "Part editor", mimeType: MCP_APP_MIME, _meta: RESOURCE_META },
          ],
        },
      });
      return;
    case "resources/templates/list":
      send({ jsonrpc: "2.0", id, result: { resourceTemplates: [] } });
      return;
    case "resources/read":
      if (params?.uri === EDITOR_URI)
        send({ jsonrpc: "2.0", id, result: { contents: [editorResource()] } });
      else
        send({
          jsonrpc: "2.0",
          id,
          error: { code: -32002, message: `no resource ${params?.uri}` },
        });
      return;
    default:
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: `${method} is not supported` } });
  }
});
