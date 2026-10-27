import { describe, expect, it } from "vite-plus/test";

import starterStep from "./starter/part.step?raw";
import {
  freePartStem,
  makeNewPart,
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

  it("is kept clear of the modules its build imports, which a file beside it would stand in for", () => {
    expect(partStem("Platform")).toBe("part_platform");
    expect(partStem("copy")).toBe("part_copy");
    expect(partStem("Logging")).toBe("part_logging");
    expect(partStem("numpy")).toBe("part_numpy");
    expect(partStem("Platform bracket")).toBe("platform_bracket");
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

  it("comes with the STEP its script builds: the block of its sizes, corner to corner", () => {
    // Change the script's sizes or sketch and this fails until the STEP is built again
    // (`starterScript`'s comment says how).
    const size = (name: string) => {
      const match = new RegExp(`^${name} = (\\d+(?:\\.\\d+)?)$`, "m").exec(script);
      return Number(match?.[1]);
    };
    // A number as the STEP writes it: 40 is "40.", 12.5 is "12.5".
    const written = (value: number) => (Number.isInteger(value) ? `${value}.` : `${value}`);
    const corner = [size("LENGTH"), size("WIDTH"), size("HEIGHT")].map(written).join(",");
    expect(corner).toBe("40.,20.,10.");
    expect(starterStep).toContain(`CARTESIAN_POINT('',(${corner}));`);
    expect(starterStep).toContain("CARTESIAN_POINT('',(0.,0.,0.));");
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

describe("New part, step by step", () => {
  /** New part's steps, recording what was opened and said; `write` is the starter's write. */
  function run(write: (folder: string) => Promise<void>, names: ReadonlyArray<string> = []) {
    const seen: string[] = [];
    const done = makeNewPart<string>({
      names: async () => names,
      create: async ({ name, onFolder, show }) => {
        seen.push(`made ${name}`);
        await onFolder("/projects/untitled-part");
        show("chat");
        return true;
      },
      writeStarter: write,
      openPart: (ref) => seen.push(`part beside ${ref}`),
      openProject: (ref) => seen.push(`overview beside ${ref}`),
      failed: (title, error) => seen.push(`${title}: ${(error as Error).message}`),
    });
    return done.then(() => seen);
  }

  it("makes the project past the names taken and opens its part", async () => {
    expect(await run(async () => {}, ["Untitled part"])).toEqual([
      "made Untitled part 2",
      "part beside chat",
    ]);
  });

  it("keeps the project when its starter can't be written, opens it, and says so", async () => {
    expect(
      await run(async () => {
        throw new Error("parts/part.step could not be written.");
      }),
    ).toEqual([
      "made Untitled part",
      "overview beside chat",
      "Made Untitled part, but its starter part could not be written: parts/part.step could not be written.",
    ]);
  });

  it("makes nothing when the names can't be read", async () => {
    const seen: string[] = [];
    await makeNewPart<string>({
      names: async () => {
        throw new Error("Studio's projects could not be read.");
      },
      create: async () => {
        seen.push("made");
        return true;
      },
      writeStarter: async () => {},
      openPart: () => {},
      openProject: () => {},
      failed: (title, error) => seen.push(`${title}: ${(error as Error).message}`),
    });
    expect(seen).toEqual(["Could not make the part: Studio's projects could not be read."]);
  });
});
