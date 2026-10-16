# Studio's own plugins

A plugin marketplace Studio loads beside text-to-cad's (`scripts/studio.ts`). The launcher copies
it into Studio's state folder at every start and writes each plugin's machine-specific MCP
configuration there (`codex.mcp.json`), so nothing in this folder names a path on one computer.

- `solidcraft`: SolidCraft (https://github.com/bherbruck/solidcraft, Apache-2.0), a parametric CAD
  app, bridged to the running app over its control port (7878). The `solidcraft-*` skills are
  SolidCraft's own, taken at v0.13.1 with its `LICENSE-APACHE` and `NOTICE`; `studio-solidcraft` is
  Studio's: how the agent works beside an engineer editing the same design by hand. Offered only
  when SolidCraft is installed in Applications.
