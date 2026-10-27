/**
 * New part, made with no agent and no questions (`useNewPart.ts`): a part script that sketches one
 * block from three named sizes, the cad skill's smallest part, so CAD mode opens on something to
 * edit, and the STEP that script builds, so the part shows at once. Its first change in CAD mode
 * builds it again from the script, as every part is built.
 */

import { copyName } from "./examples/examples";
import { fileStem } from "./newTemplates";

/** What a new part's project is called until it is renamed: "Untitled part", "Untitled part 2". */
export const UNTITLED_PART = "Untitled part";

/** Where a new part goes in its project's folder, as New's Part has it. */
export const PART_FOLDER = "parts";

/**
 * The name for a new part's project: "Untitled part", else the next one free among `existing`,
 * every project's name and Trash's, so a restore never makes two of one name.
 */
export function untitledName(existing: ReadonlyArray<string>): string {
  return copyName(UNTITLED_PART, existing);
}

/** Names a part's script can't take: the names it imports, and a module it would hide. */
const TAKEN_BY_SCRIPT = new Set(["bd", "step", "cadgen", "build123d", "sizes"]);
const PYTHON_KEYWORDS = new Set(
  "and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(
    " ",
  ),
);

/**
 * A part's file name from what it is called ("Shelf bracket" is `shelf_bracket`), which is its
 * function's name too: one a Python function can have, and not one its script already uses.
 */
export function partStem(name: string): string {
  const stem = fileStem(name);
  if (stem === "untitled") return "part";
  return /^\d/.test(stem) || TAKEN_BY_SCRIPT.has(stem) || PYTHON_KEYWORDS.has(stem)
    ? `part_${stem}`
    : stem;
}

/**
 * `stem`, else `stem_2`, `stem_3`... : the first whose script and STEP are both free among the
 * folder's files (`taken`, paths as its listing gives them), so a new part never writes over one.
 */
export function freePartStem(stem: string, taken: ReadonlyArray<string>): string {
  const used = new Set(
    taken.flatMap((path) => {
      const match = /([^/\\]+)\.(?:py|step|stp)$/i.exec(path);
      return match === null ? [] : [match[1]!.toLowerCase()];
    }),
  );
  if (!used.has(stem)) return stem;
  for (let count = 2; ; count++) {
    if (!used.has(`${stem}_${count}`)) return `${stem}_${count}`;
  }
}

/**
 * The starter part's script, as the servo bracket's parts are written: what it is, its sizes named
 * at the top, and one sketch on the Top plane, fully defined from them, extruded. `stem` names its
 * function and its label, as the script's file is named.
 */
export function starterScript(stem: string): string {
  return `"""A new part: one block, sketched on the Top plane and extruded. Change its sizes here or in CAD
mode, and add its features there. Origin: a corner of its underside, +Z up."""

from cadgen import build123d as bd
from cadgen import step
from cadgen.sketch import Sketch

LENGTH = 40.0
WIDTH = 20.0
HEIGHT = 10.0


@step
def ${stem}():
    sketch1 = Sketch("Sketch1", plane="Top")
    line1, line2, line3, line4 = sketch1.rectangle(sketch1.origin, (LENGTH, WIDTH))
    sketch1.length(line1, LENGTH)
    sketch1.length(line2, WIDTH)
    body = bd.extrude(sketch1.face(), amount=HEIGHT)
    body.label = "${stem}"
    return body


if __name__ == "__main__":
    ${stem}()
`;
}

/**
 * The STEP the starter builds (`starter/part.step`, built by cadgen from `starterScript("part")`)
 * as the script named `stem` builds it: the file and the part carry its name where a build of that
 * script writes it (a build wraps a long name's header line; STEP reads the same either way).
 */
export function starterStepAs(step: string, stem: string): string {
  return step
    .replace("FILE_NAME('part',", `FILE_NAME('${stem}',`)
    .replace("PRODUCT('part','part',", `PRODUCT('${stem}','${stem}',`);
}
