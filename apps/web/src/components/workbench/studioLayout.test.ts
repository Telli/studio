import { describe, expect, it } from "vite-plus/test";

import { projectTileGrid, TILE_GRID } from "./studioLayout";

describe("a group of project tiles", () => {
  it("goes five across only where four would leave one tile alone", () => {
    for (const tiles of [5, 9, 13]) expect(projectTileGrid(tiles)).toContain("lg:grid-cols-5");
    for (const tiles of [1, 2, 3, 4, 6, 7, 8, 10, 12]) {
      expect(projectTileGrid(tiles)).toBe(TILE_GRID);
    }
  });
});
