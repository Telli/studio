import { describe, expect, it } from "vite-plus/test";

import { sameFile, surfaceFile } from "./sameFile";

describe("same file", () => {
  it("knows a file named in the thread's folder and in full for one", () => {
    expect(sameFile("parts/tray.step", "/Users/a/studio-projects/clip/parts/tray.step")).toBe(true);
    expect(sameFile("parts/tray.step", "parts/tray.step")).toBe(true);
    expect(sameFile("parts/tray.step", "parts/daisy_tray.step")).toBe(false);
    expect(sameFile("parts/tray.step", "parts/tray.stl")).toBe(false);
  });

  it("reads a leading ./ as the folder itself, and a Windows path as its slashes", () => {
    expect(sameFile("./parts/tray.step", "/Users/a/studio-projects/clip/parts/tray.step")).toBe(
      true,
    );
    expect(sameFile("./parts/tray.step", "parts/tray.step")).toBe(true);
    expect(sameFile("parts\\tray.step", "C:\\work\\clip\\parts\\tray.step")).toBe(true);
    expect(sameFile("./parts/tray.step", "parts/daisy_tray.step")).toBe(false);
  });

  it("reads the file a tab shows, the agent's own views by their id", () => {
    expect(
      surfaceFile({
        id: `plugin:cad/cad/open:agent:${encodeURIComponent("parts/tray.step")}`,
        kind: "plugin-app",
        pluginId: "cad",
        server: "cad",
        tool: "open",
        title: "tray.step",
        resourceUri: "ui://cad",
        arguments: {},
      }),
    ).toBe("parts/tray.step");
    expect(surfaceFile({ id: "files", kind: "files" })).toBeNull();
  });
});
