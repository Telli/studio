# Studio's own plugins

A plugin marketplace Studio loads beside text-to-cad's (`scripts/studio.ts`). The launcher copies
it into Studio's state folder at every start and writes each plugin's machine-specific MCP
configuration there (`codex.mcp.json`), so nothing in this folder names a path on one computer.

- `part-editor`: Studio's part editor for text-to-cad parts, where the part script stays the
  source. `tracer/tracer.py` runs in cadgen's Python (warm, `--serve`): it reads the project's
  files with their numbers traced, records the build123d operations and gives the timeline, named
  sizes and dimensions; an edit rewrites one number in the source. `server/server.mjs --python
<cadgen's python>` is the MCP server: `part_editor_open` and a `.py` file view, both the page
  `editor/` builds into (`scripts/editor-pages.ts`, at launch), and the page's own calls; after an
  edit it builds again every part that uses the changed file. `editor/src/` also holds the page
  code SolidCraft's editor shares (the bridge, the viewport, the controls and styles).
- `solidcraft`: SolidCraft (https://github.com/bherbruck/solidcraft, Apache-2.0), a parametric CAD
  engine, behind the same editor. `server/server.mjs` runs `solidcraft-cli mcp` headless for each
  thread (the plugin host runs one process per thread, shared by the agent and its tabs) and adds
  `editor_open`, a `.solidcraft` file view and the page's own calls. Hand edits save the design,
  write its STEP beside it and are told to the agent on its next call. The `solidcraft-*` skills
  are SolidCraft's own, taken at v0.13.1 with its `LICENSE-APACHE` and `NOTICE`;
  `studio-solidcraft` is Studio's. Offered only with `STUDIO_SOLIDCRAFT=1` and SolidCraft installed
  in Applications (`STUDIO_SOLIDCRAFT_APP=1` bridges it to the app, control port 7878).
