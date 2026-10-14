import { describe, expect, it } from "vite-plus/test";

import { readViewContext, viewImageName } from "./viewContext";

describe("view context", () => {
  it("splits what the viewer adds into composer text and pictures", () => {
    expect(
      readViewContext([
        { type: "text", text: "Make this hole 6 mm\n\nFile: /w/bracket.step" },
        {
          type: "image",
          data: "iVBO",
          mimeType: "image/png",
          _meta: { "openai/title": "CAD view · bracket.step" },
        },
        { type: "text", text: "  " },
        "junk",
      ]),
    ).toEqual({
      text: "Make this hole 6 mm\n\nFile: /w/bracket.step",
      images: [{ name: "cad-view-bracket-step.png", data: "iVBO", mimeType: "image/png" }],
    });
  });

  it("names an untitled picture by its place", () => {
    expect(viewImageName(undefined, 1)).toBe("view-2.png");
  });
});
