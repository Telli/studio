import { describe, expect, it } from "vite-plus/test";

import { aboutFile, isPlainText } from "./aboutFile";

describe("about a file", () => {
  it("says what a file with no viewer is, as an engineer would", () => {
    expect(aboutFile("cam/bracket.nc")).toMatch(/^G-code/);
    expect(aboutFile("fab/board-F_Cu.gbr")).toMatch(/Gerber/);
    expect(aboutFile("electronics/main.kicad_sch")).toMatch(/KiCad schematic/);
    expect(aboutFile("bom/parts.xlsx")).toBe("A spreadsheet.");
    expect(aboutFile("project.json")).toMatch(/^The project's setup/);
    expect(aboutFile("results/bracket.fea.json")).toBe("Data the tools read and write.");
    expect(aboutFile("notes/thing.bin")).toBe("A file of the project.");
  });

  it("reads plain text as a document", () => {
    expect(isPlainText("docs/notes.txt")).toBe(true);
    expect(isPlainText("cam/bracket.nc")).toBe(false);
  });
});
