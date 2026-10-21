import { describe, expect, it } from "vite-plus/test";

import { aboutFile, isPlainText, openLabel } from "./aboutFile";

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

  it("names opening a file in its own app by what it is, and never offers to run one", () => {
    expect(openLabel("bom/parts.xlsx")).toBe("Open the spreadsheet");
    expect(openLabel("electronics/main.kicad_sch")).toBe("Open in KiCad");
    expect(openLabel("cam/bracket.nc")).toBe("Open");
    expect(openLabel("tools/run.command")).toBeNull();
    expect(openLabel("parts/bracket.py")).toBeNull();
  });
});
