import { describe, expect, it } from "vite-plus/test";

import starterStep from "./starter/part.step?raw";
import {
  freePartStem,
  partStem,
  starterScript,
  starterStepAs,
  UNTITLED_PART,
  untitledName,
} from "./newPart";

describe("untitledName", () => {
  it("names the first new part's project Untitled part", () => {
    expect(untitledName([])).toBe(UNTITLED_PART);
    expect(untitledName(["Servo bracket"])).toBe("Untitled part");
  });

  it("numbers the next past every name taken, Trash's too, whatever their case", () => {
    expect(untitledName(["Untitled part"])).toBe("Untitled part 2");
    expect(untitledName(["untitled part", "Untitled Part 2", "Servo bracket"])).toBe(
      "Untitled part 3",
    );
  });
});

describe("a new part's file", () => {
  it("is named as a file name, kept clear of the names its script needs", () => {
    expect(partStem("Part")).toBe("part");
    expect(partStem("Shelf bracket")).toBe("shelf_bracket");
    expect(partStem("2nd bracket")).toBe("part_2nd_bracket");
    expect(partStem("step")).toBe("part_step");
    expect(partStem("class")).toBe("part_class");
    expect(partStem("  ")).toBe("part");
  });

  it("takes the next name free beside the parts already there", () => {
    expect(freePartStem("part", [])).toBe("part");
    expect(freePartStem("part", ["parts/part.py", "parts/part.step"])).toBe("part_2");
    expect(freePartStem("part", ["parts/Part.STEP", "parts/part_2.py"])).toBe("part_3");
    expect(freePartStem("bracket", ["parts/part.py"])).toBe("bracket");
  });
});

describe("the starter part", () => {
  const script = starterScript("part");

  it("is a part script: cadgen's step decorator on one function, run when the script is", () => {
    expect(script).toContain("from cadgen import step");
    expect(script).toMatch(/^@step\ndef part\(\):$/m);
    expect(script).toMatch(/^if __name__ == "__main__":\n {4}part\(\)$/m);
  });

  it("names its sizes at the top and sketches one block from them", () => {
    const sizes = [...script.matchAll(/^([A-Z][A-Z_]*) = (\d+(?:\.\d+)?)$/gm)].map(
      (match) => match[1],
    );
    expect(sizes).toEqual(["LENGTH", "WIDTH", "HEIGHT"]);
    expect(script.indexOf("HEIGHT =")).toBeLessThan(script.indexOf("@step"));
    expect(script).toContain('Sketch("Sketch1", plane="Top")');
    expect(script).toContain("sketch1.rectangle(sketch1.origin, (LENGTH, WIDTH))");
    expect(script).toContain("bd.extrude(sketch1.face(), amount=HEIGHT)");
  });

  it("is named for its file: its function and its label", () => {
    const named = starterScript("shelf_bracket");
    expect(named).toMatch(/^def shelf_bracket\(\):$/m);
    expect(named).toContain('body.label = "shelf_bracket"');
    expect(named).toMatch(/^ {4}shelf_bracket\(\)$/m);
  });

  it("comes with the STEP its script builds, named for its file as a build names it", () => {
    expect(starterStepAs(starterStep, "part")).toBe(starterStep);
    const named = starterStepAs(starterStep, "shelf_bracket");
    expect(named).toContain("FILE_NAME('shelf_bracket',");
    expect(named).toContain("PRODUCT('shelf_bracket','shelf_bracket',");
    expect(named).not.toContain("PRODUCT('part'");
    // The category every part has stays as a build writes it.
    expect(named).toContain("PRODUCT_RELATED_PRODUCT_CATEGORY('part',");
  });
});
