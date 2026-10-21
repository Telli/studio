import { describe, expect, it } from "vite-plus/test";

import { projectCover } from "./useProjectCover";

describe("a project's picture", () => {
  it("pictures the whole product: its first assembly before its parts", () => {
    expect(
      projectCover([
        "README.md",
        "parts/bracket.py",
        "parts/bracket.step",
        "assemblies/clip.py",
        "assemblies/clip.step",
      ]),
    ).toBe("assemblies/clip.step");
    expect(projectCover(["parts/bracket.step", "parts/arm.step"])).toBe("parts/arm.step");
  });

  it("pictures a board when there is no part, and nothing when there is only writing", () => {
    expect(projectCover(["docs/setup.md", "electronics/board/board.kicad_pcb"])).toBe(
      "electronics/board/board.kicad_pcb",
    );
    expect(projectCover(["README.md", "assets/icon.svg"])).toBeNull();
  });
});
