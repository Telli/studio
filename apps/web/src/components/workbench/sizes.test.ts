import { describe, expect, it } from "vite-plus/test";

import {
  plainSizesError,
  readSizes,
  SIZE_NAME,
  SIZE_NUMBER,
  sizeChangedNote,
  sharedSizePrompt,
} from "./sizes";

describe("readSizes", () => {
  it("reads the CAD service's groups, the shared ones with the parts that use them", () => {
    const read = readSizes({
      ok: true,
      units: "in",
      sharedFile: "cad/sizes.py",
      groups: [
        {
          file: "cad/sizes.py",
          name: "sizes",
          kind: "shared",
          usedBy: ["bracket", 4],
          sizes: [
            { name: "WALL", line: 3, text: "2.0", value: 2, editable: true, note: "every wall" },
          ],
        },
        {
          file: "cad/bracket.py",
          name: "bracket",
          kind: "part",
          sizes: [
            { name: "HEIGHT", line: 4, text: "2 * WALL", value: null, editable: false },
            { name: 7 },
          ],
        },
        { file: "broken.py" },
      ],
    });
    expect(read).toEqual({
      units: "in",
      sharedFile: "cad/sizes.py",
      groups: [
        {
          file: "cad/sizes.py",
          name: "sizes",
          kind: "shared",
          usedBy: ["bracket"],
          sizes: [
            { name: "WALL", line: 3, text: "2.0", value: 2, editable: true, note: "every wall" },
          ],
        },
        {
          file: "cad/bracket.py",
          name: "bracket",
          kind: "part",
          usedBy: [],
          sizes: [
            { name: "HEIGHT", line: 4, text: "2 * WALL", value: null, editable: false, note: "" },
          ],
        },
      ],
    });
  });

  it("says why when the CAD service could not read them", () => {
    expect(readSizes({ ok: false, error: "Sizes needs the project's folder." })).toEqual({
      error: "Sizes needs the project's folder.",
    });
    expect(readSizes(null)).toEqual({ error: "Studio's CAD service did not answer." });
  });
});

describe("Sizes in words", () => {
  it("asks for a restart when the CAD service predates Sizes", () => {
    expect(plainSizesError("Not found")).toBe("Studio needs a restart before it can show sizes.");
    expect(plainSizesError("WIDTH is a number here, like 12.5.")).toBe(
      "WIDTH is a number here, like 12.5.",
    );
  });

  it("tells the agent of a change as a hand change is told", () => {
    expect(sizeChangedNote({ name: "WIDTH", file: "bracket.py", from: "40", to: "45" })).toBe(
      "In Sizes I changed WIDTH in bracket.py from 40 to 45.",
    );
    expect(sharedSizePrompt({ name: "WALL", file: "sizes.py" })).toContain("WALL from sizes.py");
  });

  it("takes names and numbers as the scripts write them", () => {
    expect(SIZE_NAME.test("WALL_THICKNESS")).toBe(true);
    expect(SIZE_NAME.test("wall")).toBe(false);
    expect(["12", "12.5", "-3", ".5", "1e3"].every((typed) => SIZE_NUMBER.test(typed))).toBe(true);
    expect(["12 mm", "2*WALL", ""].some((typed) => SIZE_NUMBER.test(typed))).toBe(false);
  });
});
