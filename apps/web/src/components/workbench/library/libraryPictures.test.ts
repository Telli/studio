// @effect-diagnostics nodeBuiltinImport:off - reads the sample project's documents from disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { LIBRARY_DOCUMENTS } from "./libraryCatalog";
import libraryExamples from "./libraryExamples.json";
import { examplePictureOf, pictureOf, picturePath } from "./libraryPictures";

const ROOT = NodePath.join(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const SAMPLE = NodePath.join(ROOT, "studio-sample", "servo-bracket");

const EXAMPLES: Readonly<
  Record<string, { sample?: string; example: string; picture: string } | null>
> = libraryExamples;

/** The document types, then text-to-cad's skills, which the catalog test pins to its folders. */
const ENTRIES = [
  ...LIBRARY_DOCUMENTS.map((entry) => entry.id),
  ...Object.keys(EXAMPLES).filter((id) => id.startsWith("skill:text-to-cad/")),
];

describe("library pictures", () => {
  it("has a picture for every entry", () => {
    const made = ENTRIES.filter((id) => EXAMPLES[id] !== null);
    expect(made.filter((id) => pictureOf(id) === null)).toEqual([]);
    for (const id of made) {
      const { sample, example, picture } = EXAMPLES[id]!;
      if (picture === "page") {
        // A page is drawn from the servo bracket's own text.
        expect(sample ?? "servo-bracket", id).toBe("servo-bracket");
        const text = NodeFS.readFileSync(NodePath.join(SAMPLE, example), "utf8");
        expect(pictureOf(id), id).toEqual({ kind: "page", text });
        expect(text, id).toMatch(/^# /);
      } else {
        expect(pictureOf(id), id).toEqual({
          kind: "image",
          url: expect.stringContaining(`/pictures/${picturePath(picture, sample)}`),
        });
      }
    }
    expect(picturePath("parts/servo_bracket.step")).toBe("parts__servo_bracket.step.webp");
    // Another example's pictures carry its id, so two examples' files of one path never meet.
    expect(picturePath("pictures/motor_plate_pmi.png", "motor-mount")).toBe(
      "motor-mount__pictures__motor_plate_pmi.png.webp",
    );
  });

  it("leaves own templates and other plugins' skills to LibraryPicture", () => {
    expect(pictureOf("own:/p/Templates/Supplier audit.md")).toBeNull();
    expect(pictureOf("skill:other/thing")).toBeNull();
    // An example the sample could not make (its value is null) has no picture either.
    const notMade = ENTRIES.filter((id) => EXAMPLES[id] === null);
    expect(notMade).not.toEqual([]);
    expect(notMade.filter((id) => pictureOf(id) !== null)).toEqual([]);
  });

  it("has a picture for every example Studio ships, and none for one it does not", () => {
    const examples = NodeFS.readdirSync(NodePath.join(ROOT, "studio-sample"), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
    expect(examples).toContain("servo-bracket");
    expect(examples.filter((id) => examplePictureOf(id) === null)).toEqual([]);
    expect(examplePictureOf("no-such-example")).toBeNull();
  });
});
