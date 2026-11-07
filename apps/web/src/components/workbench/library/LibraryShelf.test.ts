import { describe, expect, it } from "vite-plus/test";

import { gatherShortShelves } from "./LibraryShelf";

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
