import { describe, expect, it } from "vite-plus/test";

import { gatherShortShelves, shortRowEnd } from "./LibraryShelf";

const tiles: Record<string, number> = { New: 5, Analysis: 1, Manufacturing: 7, Mine: 2, Other: 1 };
const gathered = (...shelves: string[]) =>
  gatherShortShelves(shelves, (shelf) => tiles[shelf] ?? 0);

describe("short shelves", () => {
  it("come up beside the first of them, past the long shelves between", () => {
    expect(gathered("New", "Analysis", "Manufacturing", "Mine", "Other")).toEqual([
      "New",
      "Analysis",
      "Mine",
      "Other",
      "Manufacturing",
    ]);
  });

  it("leave long shelves in their order", () => {
    expect(gathered("Manufacturing", "New")).toEqual(["Manufacturing", "New"]);
    expect(gathered("Analysis", "New", "Other", "Manufacturing")).toEqual([
      "Analysis",
      "Other",
      "New",
      "Manufacturing",
    ]);
  });
});

describe("the last short shelf", () => {
  const rowEnd = (...shelves: string[]) => shortRowEnd(shelves, (shelf) => tiles[shelf] ?? 0);

  it("runs to the end of the row the short shelves before it leave, at every width", () => {
    expect(rowEnd("New", "Mine", "Analysis", "Manufacturing")).toEqual({
      shelf: "Analysis",
      spans: { "--span-of-2": 2, "--span-of-3": 1, "--span-of-4": 2, "--span-of-6": 4 },
    });
  });

  it("takes a whole row when it wraps or stands alone", () => {
    expect(rowEnd("Mine", "Other", "Analysis")?.spans).toEqual({
      "--span-of-2": 1,
      "--span-of-3": 3,
      "--span-of-4": 1,
      "--span-of-6": 3,
    });
    expect(rowEnd("New", "Mine")?.spans).toEqual({
      "--span-of-2": 2,
      "--span-of-3": 3,
      "--span-of-4": 4,
      "--span-of-6": 6,
    });
  });

  it("is nothing when every shelf is long", () => {
    expect(rowEnd("New", "Manufacturing")).toBeNull();
  });
});
