// @effect-diagnostics nodeBuiltinImport:off - a build step the launcher runs before the app starts.
/**
 * Builds Studio's part editor (studio-plugins/solidcraft/editor) into the one HTML file its server
 * serves as an MCP Apps view: Studio frames views from a single document, so the script and styles
 * are inlined. esbuild is the one beside the web app's Vite; React and lucide come from the web
 * app, three.js from client-runtime, so the editor needs no packages of its own.
 */
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";

export async function buildSolidcraftEditor(appRoot: string, outFile: string): Promise<void> {
  const editor = NodePath.join(appRoot, "studio-plugins", "solidcraft", "editor");
  const viteRoot = NodePath.dirname(
    NodeFS.realpathSync(
      NodePath.join(appRoot, "apps", "web", "node_modules", "vite", "package.json"),
    ),
  );
  const esbuild = NodeModule.createRequire(NodePath.join(viteRoot, "package.json"))(
    "esbuild",
  ) as typeof import("esbuild");
  const built = await esbuild.build({
    entryPoints: [NodePath.join(editor, "src", "main.tsx")],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    write: false,
    jsx: "automatic",
    legalComments: "none",
    nodePaths: [
      NodePath.join(appRoot, "apps", "web", "node_modules"),
      NodePath.join(appRoot, "packages", "client-runtime", "node_modules"),
    ],
    define: { "process.env.NODE_ENV": '"production"' },
    logLevel: "silent",
  });
  const script = built.outputFiles[0]?.text ?? "";
  const styles = NodeFS.readFileSync(NodePath.join(editor, "src", "styles.css"), "utf8");
  const page = NodeFS.readFileSync(NodePath.join(editor, "index.html"), "utf8")
    .replace("/*STYLES*/", () => styles.replaceAll("</style", "<\\/style"))
    .replace("/*SCRIPT*/", () => script.replaceAll("</script", "<\\/script"));
  NodeFS.mkdirSync(NodePath.dirname(outFile), { recursive: true });
  NodeFS.writeFileSync(outFile, page);
}
