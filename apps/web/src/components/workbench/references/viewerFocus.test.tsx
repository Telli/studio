// @vitest-environment jsdom

import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vite-plus/test";

// The view's environment, reduced to what opening one needs: its document, and a server that answers.
const mocks = vi.hoisted(() => ({
  openView: vi.fn(async () => ({
    _tag: "Success" as const,
    value: { html: "<html></html>", csp: undefined, toolInput: {}, toolResult: undefined },
  })),
  request: vi.fn(async () => ({ _tag: "Success" as const, value: { result: {} } })),
}));
vi.mock("~/state/plugins", () => ({
  // No plugins listed: a script the view sends back to opens as a document, as it would with them.
  pluginEnvironment: { openView: "openView", request: "request", list: () => null },
}));
vi.mock("~/state/use-atom-command", () => ({
  useAtomCommand: (command: string) => (command === "openView" ? mocks.openView : mocks.request),
}));
vi.mock("~/hooks/useHtmlRenderTheme", () => ({
  useHtmlRenderTheme: () => ({ appearance: "light", variables: {} }),
}));
vi.mock("~/lib/observeResize", () => ({ observeResize: () => () => {} }));
// A browser's frame, as the web app runs a view outside the desktop app.
vi.mock("../../plugins/pluginViewHost", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../plugins/pluginViewHost")>()),
  readPluginViewsBridge: () => null,
  srcdocPluginViewHtml: () => "<html></html>",
}));

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { PluginViewFrame } from "../../plugins/PluginViewFrame";
import { useViewerFocusStore, viewerFocusOf } from "./viewerFocus";

const thread = scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("thread-1"));
const threadKey = scopedThreadKey(thread);
const target = {
  environmentId: thread.environmentId,
  threadId: thread.threadId,
  pluginId: "text-to-cad",
  server: "cad",
  tool: "cad_file",
  title: "bracket.step",
  resourceUri: "ui://cad/app.html",
  arguments: {},
  file: "parts/bracket.step",
};
const settle = () => act(async () => {});
const tabs = () => selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, thread);
const askOf = (file: string) => viewerFocusOf(useViewerFocusStore.getState(), threadKey, file);

/** The view, mounted beside the chat for `parts/bracket.step`, its host up. */
async function bracketView() {
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <PluginViewFrame target={target} focusPlace={{ threadKey, file: "parts/bracket.step" }} />,
    );
  });
  await settle();
  await settle();
  const frame = container.querySelector("iframe");
  return {
    frame,
    /** What the view posts its host, as from inside its frame. */
    says: (method: string, params: unknown) =>
      act(async () => {
        window.dispatchEvent(
          new MessageEvent("message", {
            data: { jsonrpc: "2.0", method, params },
            source: frame?.contentWindow ?? null,
          }),
        );
      }),
    close: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  useViewerFocusStore.setState({ byThread: {} });
  useRightPanelStore.setState({
    byThreadKey: {},
    threadPanelVisibilityByThreadKey: {},
    userActionRevisionByThreadKey: {},
    closeRevisionByThreadKey: {},
  });
});

it("lets the ask a view was given go when the view's host goes, so no view opened later selects it", async () => {
  const { focus } = useViewerFocusStore.getState();
  focus(threadKey, "parts/bracket.step", { path: "parts/bracket.py", line: 12 });
  // Another part's ask, beside the same chat, is not this view's to let go.
  focus(threadKey, "parts/clip.step", { path: "parts/clip.py", line: 4 });
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <PluginViewFrame target={target} focusPlace={{ threadKey, file: "parts/bracket.step" }} />,
    );
  });
  await settle();
  await settle();
  // The view is up, with its host, and the ask waits for the part to be read.
  expect(container.querySelector("iframe")).not.toBeNull();
  expect(viewerFocusOf(useViewerFocusStore.getState(), threadKey, "parts/bracket.step")).toEqual({
    path: "parts/bracket.py",
    line: 12,
    nonce: expect.any(Number),
  });
  // Closed before it read the part: its ask goes with it, the other part's stays.
  await act(async () => root.unmount());
  expect(viewerFocusOf(useViewerFocusStore.getState(), threadKey, "parts/bracket.step")).toBeNull();
  expect(viewerFocusOf(useViewerFocusStore.getState(), threadKey, "parts/clip.step")).toEqual({
    path: "parts/clip.py",
    line: 4,
    nonce: expect.any(Number),
  });
  container.remove();
});

it("opens the part's script at the cited line when the view finds no feature there, and nothing more when it does", async () => {
  const { focus } = useViewerFocusStore.getState();
  focus(threadKey, "parts/bracket.step", { path: "parts/bracket.py", line: 12 });
  const view = await bracketView();
  expect(view.frame?.contentWindow).toBeTruthy();
  // A feature holds the line: it is selected in the view, the ask goes, and nothing else opens.
  const found = askOf("parts/bracket.step");
  await view.says("studio/notifications/focus-taken", { nonce: found?.nonce, found: true });
  expect(askOf("parts/bracket.step")).toBeNull();
  expect(tabs().surfaces).toEqual([]);
  // Pressed twice before the view answers: its late answer to the first, found nowhere, opens nothing, as the second
  // ask is the view's to answer.
  focus(threadKey, "parts/bracket.step", { path: "parts/bracket.py", line: 5 });
  await settle();
  const first = askOf("parts/bracket.step");
  focus(threadKey, "parts/bracket.step", { path: "parts/bracket.py", line: 3 });
  await settle();
  const second = askOf("parts/bracket.step");
  await view.says("studio/notifications/focus-taken", { nonce: first?.nonce, found: false });
  expect(tabs().surfaces).toEqual([]);
  expect(askOf("parts/bracket.step")).toEqual(second);
  // No feature holds the second's line (a constant, a helper's line, a build that failed): the script opens there, in
  // front, as Simple view opens it, and the ask goes.
  await view.says("studio/notifications/focus-taken", { nonce: second?.nonce, found: false });
  expect(askOf("parts/bracket.step")).toBeNull();
  expect(tabs().activeSurfaceId).toBe("file:parts/bracket.py");
  expect(tabs().surfaces).toEqual([
    expect.objectContaining({ relativePath: "parts/bracket.py", revealLine: 3 }),
  ]);
  await view.close();
});
