import { describe, expect, it } from "vite-plus/test";

import { studioImportKind } from "./studioImport.ts";

describe("studioImportKind", () => {
  it("knows CAD models, drawings and photos by their extension", () => {
    expect(studioImportKind("/p/Kawarobo/Mini/Spur gear 30T.STEP")).toBe("model");
    expect(studioImportKind("bracket.sldprt")).toBe("model");
    expect(studioImportKind("plate.dxf")).toBe("drawing");
    expect(studioImportKind("IMG_2041.HEIC")).toBe("photo");
  });

  it("reads a PDF or a sheet by its name", () => {
    expect(studioImportKind("servo_bracket_drawing.pdf")).toBe("drawing");
    expect(studioImportKind("MG996R datasheet.pdf")).toBe("datasheet");
    expect(studioImportKind("trip notes.pdf")).toBe("notes");
    expect(studioImportKind("robot BOM.xlsx")).toBe("partsList");
    expect(studioImportKind("budget.csv")).toBe("notes");
  });

  it("leaves out everything else", () => {
    expect(studioImportKind("song.mp3")).toBeNull();
    expect(studioImportKind(".DS_Store")).toBeNull();
    expect(studioImportKind("Makefile")).toBeNull();
  });
});
