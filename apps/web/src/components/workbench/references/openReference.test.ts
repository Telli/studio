import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { selectThreadRightPanelState, useRightPanelStore } from "~/rightPanelStore";
import { openInPanel } from "../useOpenInWorkbench";
import type { SourceTarget } from "./answerSources";
import { openReference, referenceOpening } from "./openReference";
import { useViewerFocusStore, viewerFocusOf, viewerFocusPlace } from "./viewerFocus";

const ROOT = "/work/rover-cad";
// The thread's folder as Studio lists it, relative to it.
const FILES = [
  "README.md",
  "docs/prd.md",
  "parts/bracket.py",
  "parts/bracket.step",
  "parts/hinge.py",
  "parts/hinge.STP",
  "parts/clip.py",
];
const PRD = [
  "# Rover arm",
  "",
  "## What it is",
  "A two-axis arm.",
  "",
  "## Mounting (M3)",
  "Four M3 screws.",
].join("\n");

const file = (
  path: string,
  lines: [number, number] | null = null,
  heading: string | null = null,
): SourceTarget => ({ kind: "file", path, lines, heading });

const opening = (target: SourceTarget, files: ReadonlyArray<string> | null = FILES) =>
  referenceOpening(target, {
    root: ROOT,
    files,
    read: async (path) => (path === "docs/prd.md" ? PRD : null),
  });

describe("referenceOpening", () => {
  it("opens a part's script lines on the part", async () => {
    expect(await opening(file("parts/bracket.py", [12, 18]))).toEqual({
      kind: "part",
      step: "parts/bracket.step",
      script: "parts/bracket.py",
      line: 12,
    });
    // A `.stp` is a part's model too. Without lines the script's first line is asked for, where
    // no feature starts, so the part just opens.
    expect(await opening(file("parts/hinge.py"))).toEqual({
      kind: "part",
      step: "parts/hinge.STP",
      script: "parts/hinge.py",
      line: 1,
    });
    // A script with no model beside it, and any script while the folder is still being listed,
    // opens as a file at its lines.
    expect(await opening(file("parts/clip.py", [4, 9]))).toEqual({
      kind: "file",
      path: "parts/clip.py",
      line: 4,
    });
    expect(await opening(file("parts/bracket.py", [12, 18]), null)).toEqual({
      kind: "file",
      path: "parts/bracket.py",
      line: 12,
    });
  });

  it("opens a document at its heading", async () => {
    // The heading is taken as written, its parentheses too.
    expect(await opening(file("docs/prd.md", null, "Mounting (M3)"))).toEqual({
      kind: "file",
      path: "docs/prd.md",
      line: 6,
    });
    // A heading the document lacks, or a document that cannot be read, opens at its top.
    expect(await opening(file("docs/prd.md", null, "Mounting"))).toEqual({
      kind: "file",
      path: "docs/prd.md",
      line: null,
    });
    expect(await opening(file("docs/gone.md", null, "Mounting (M3)"))).toEqual({
      kind: "file",
      path: "docs/gone.md",
      line: null,
    });
    // A file without lines or a heading opens at its top; a cited model opens as itself.
    expect(await opening(file("README.md"))).toEqual({
      kind: "file",
      path: "README.md",
      line: null,
    });
    expect(await opening(file("parts/bracket.step"))).toEqual({
      kind: "file",
      path: "parts/bracket.step",
      line: null,
    });
  });

  it("opens a page as a link", async () => {
    expect(await opening({ kind: "url", url: "https://example.com/m3#clearance" })).toEqual({
      kind: "link",
      url: "https://example.com/m3#clearance",
    });
    // What the agent knew without opening anything opens nothing.
    expect(await opening({ kind: "own", text: "ISO 273 clearance holes" })).toBeNull();
  });

  it("opens a file Claude read in full by its place in the folder, and one outside as written", async () => {
    expect(await opening(file("/work/rover-cad/parts/bracket.py", [12, 18]))).toEqual({
      kind: "part",
      step: "parts/bracket.step",
      script: "parts/bracket.py",
      line: 12,
    });
    expect(await opening(file("/work/rover-cad/docs/prd.md", null, "What it is"))).toEqual({
      kind: "file",
      path: "docs/prd.md",
      line: 3,
    });
    expect(await opening(file("/work/shared/fasteners.md", [3, 3]))).toEqual({
      kind: "file",
      path: "/work/shared/fasteners.md",
      line: 3,
    });
  });
});

const thread = scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("thread-1"));
const threadKey = scopedThreadKey(thread);
const focusOn = (file: string) => viewerFocusOf(useViewerFocusStore.getState(), threadKey, file);

describe("the place a part's view is asked to show", () => {
  afterEach(() => useViewerFocusStore.setState({ byThread: {} }));

  it("a focus is cleared only by its own nonce", () => {
    const { focus, take } = useViewerFocusStore.getState();
    focus(threadKey, "parts/bracket.step", { path: "parts/bracket.py", line: 12 });
    const first = focusOn("parts/bracket.step");
    // Pressed again, at another line, before the view answered the first.
    focus(threadKey, "parts/bracket.step", { path: "parts/bracket.py", line: 30 });
    const second = focusOn("parts/bracket.step");
    expect(second).toEqual({ path: "parts/bracket.py", line: 30, nonce: expect.any(Number) });
    expect(second?.nonce).not.toBe(first?.nonce);
    // The view's answer to the first press comes late: the second ask stands.
    take(threadKey, "parts/bracket.step", first?.nonce ?? -1);
    expect(focusOn("parts/bracket.step")).toEqual(second);
    take(threadKey, "parts/bracket.step", second?.nonce ?? -1);
    expect(focusOn("parts/bracket.step")).toBeNull();
    expect(useViewerFocusStore.getState().byThread).toEqual({});
  });

  it("is found by the part's view however its file was named, and only beside its own chat", () => {
    useViewerFocusStore
      .getState()
      .focus(threadKey, "parts/bracket.step", { path: "parts/bracket.py", line: 12 });
    const asked = focusOn("parts/bracket.step");
    const view = (fields: { file?: string; arguments?: Record<string, unknown> }) =>
      viewerFocusPlace({
        environmentId: thread.environmentId,
        threadId: thread.threadId,
        arguments: {},
        ...fields,
      });
    // A tab opened on the file, in a new chat by its full path, or the agent's own view of it.
    expect(view({ file: "parts/bracket.step" })).toEqual({ threadKey, file: "parts/bracket.step" });
    expect(view({ file: "/work/rover-cad/parts/bracket.step" })).toEqual({
      threadKey,
      file: "/work/rover-cad/parts/bracket.step",
    });
    expect(view({ arguments: { path: "/work/rover-cad/parts/bracket.step" } })).toEqual({
      threadKey,
      file: "/work/rover-cad/parts/bracket.step",
    });
    expect(focusOn("/work/rover-cad/parts/bracket.step")).toEqual(asked);
    // Another part, another chat's view of this part, and a view of no file are asked nothing.
    expect(focusOn("parts/clip.step")).toBeNull();
    const elsewhere = scopedThreadKey(
      scopeThreadRef(EnvironmentId.make("local"), ThreadId.make("thread-2")),
    );
    expect(
      viewerFocusOf(useViewerFocusStore.getState(), elsewhere, "parts/bracket.step"),
    ).toBeNull();
    expect(view({})).toBeNull();
    expect(
      viewerFocusPlace({ ...thread, threadId: null, file: "parts/bracket.step", arguments: {} }),
    ).toBeNull();
  });
});

describe("openReference", () => {
  const tabs = () => selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, thread);
  // Opened beside the chat as a chat's file link opens a file, with no plugins listed yet.
  const press = (opening: Parameters<typeof openReference>[0], simpleView: boolean) =>
    openReference(opening, {
      openFile: (path, line) => openInPanel(undefined, thread, path, line),
      openLink: () => {},
      threadKey,
      simpleView,
    });
  const bracket = {
    kind: "part",
    step: "parts/bracket.step",
    script: "parts/bracket.py",
    line: 12,
  } as const;

  beforeEach(() => {
    useRightPanelStore.setState({
      byThreadKey: {},
      threadPanelVisibilityByThreadKey: {},
      userActionRevisionByThreadKey: {},
      closeRevisionByThreadKey: {},
    });
  });
  afterEach(() => useViewerFocusStore.setState({ byThread: {} }));

  it("opens a part in the workspace and asks its view for the feature at the cited line", () => {
    press(bracket, false);
    expect(tabs().surfaces.map((surface) => surface.id)).toEqual(["file:parts/bracket.step"]);
    expect(tabs().activeSurfaceId).toBe("file:parts/bracket.step");
    expect(focusOn("parts/bracket.step")).toEqual({
      path: "parts/bracket.py",
      line: 12,
      nonce: expect.any(Number),
    });
  });

  it("opens a part in Simple view with its script at those lines in front, asking no feature", () => {
    press(bracket, true);
    expect(tabs().surfaces.map((surface) => surface.id)).toEqual([
      "file:parts/bracket.step",
      "file:parts/bracket.py",
    ]);
    expect(tabs().activeSurfaceId).toBe("file:parts/bracket.py");
    expect(tabs().surfaces[1]).toMatchObject({ relativePath: "parts/bracket.py", revealLine: 12 });
    expect(useViewerFocusStore.getState().byThread).toEqual({});
  });
});
