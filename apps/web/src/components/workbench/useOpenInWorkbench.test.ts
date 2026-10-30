import { describe, expect, it } from "vite-plus/test";

import { isWordsPdf } from "./useOpenInWorkbench";

describe("which PDFs are words", () => {
  it("opens a drawing's PDF in the CAD view, and a PDF of words as a document", () => {
    expect(isWordsPdf("drawings/motor_plate_drawing.pdf")).toBe(false);
    expect(isWordsPdf("bracket_drawing.pdf")).toBe(false);
    expect(isWordsPdf("drawings/shelf-bracket.pdf")).toBe(false);
    expect(isWordsPdf("docs/nema17_datasheet.pdf")).toBe(true);
    expect(isWordsPdf("quote.PDF")).toBe(true);
    expect(isWordsPdf("pictures/render.png")).toBe(false);
  });
});
