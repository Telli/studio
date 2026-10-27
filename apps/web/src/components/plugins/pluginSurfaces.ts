import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";
import type { PluginViewChoice } from "@t3tools/client-runtime/state/plugins";

import type { PluginAppSurface } from "~/rightPanelStore";

const fileName = (path: string) =>
  path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1) || path;

/**
 * The right-panel tab for a plugin view. One tab per view, and per file for a
 * view that opens files, so opening the same thing again focuses its tab.
 */
export function pluginAppSurface(choice: PluginViewChoice, file?: string): PluginAppSurface {
  const { view } = choice;
  const key = [choice.pluginId, view.server, view.tool].map(encodeURIComponent).join("/");
  return {
    id: `plugin:${key}${file === undefined ? "" : `:${encodeURIComponent(file)}`}`,
    kind: "plugin-app",
    pluginId: choice.pluginId,
    server: view.server,
    tool: view.tool,
    title: file === undefined ? view.title : fileName(file),
    resourceUri: view.resourceUri,
    arguments: {},
    ...(file === undefined ? {} : { file }),
  };
}

/**
 * The tab for a view an agent opened through its tool (`cad_open`): the view
 * reruns the call with the agent's latest arguments, one tab per source it names
 * (a file's path, or a model's document id, titled as the view is until it
 * syncs its model's name) and one for calls that name none.
 */
export function agentViewSurface(
  choice: PluginViewChoice,
  args: Record<string, unknown>,
  path: string | null,
): PluginAppSurface {
  const { view } = choice;
  const key = [choice.pluginId, view.server, view.tool].map(encodeURIComponent).join("/");
  return {
    id: `plugin:${key}:agent${path === null ? "" : `:${encodeURIComponent(path)}`}`,
    kind: "plugin-app",
    pluginId: choice.pluginId,
    server: view.server,
    tool: view.tool,
    title: path === null || isDocumentId(path) ? view.title : fileName(path),
    resourceUri: view.resourceUri,
    arguments: args,
  };
}
