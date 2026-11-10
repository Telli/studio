import { describe, expect, it } from "vite-plus/test";

import { parseCheckResult } from "./checkResults";
import type { ProjectModel } from "./projectModels";
import { shownResultOutOfDate } from "./shownResult";
import type { FolderChecks } from "./useProjectChecks";

const ROOT = "/work/bracket";
const ID = "6f1c0d8e-2b7a-4c1e-9d3f-5a6b7c8d9e0f";
const CHECKED = "2026-10-01T12:00:00.000Z";
const seconds = (time: string) => String(Date.parse(time) / 1000);

/** A strength study of the model, written at `written` (no time when the file names none). */
const study = (written?: string) =>
  parseCheckResult(
    "FEA/bracket.fea.json",
    JSON.stringify({
      generator: "cadgen fea",
      document: ID,
      summary: { safety_factor: 6.3, checks: [{ label: "Strength" }] },
      files: { glb: "bracket.fea.glb" },
      findings: [],
    }),
    written,
  )!;

const folders = (written?: string, root = ROOT): ReadonlyArray<FolderChecks> => [
  {
    root,
    paths: ["parts/bracket.py", "FEA/bracket.fea.json", "FEA/bracket.fea.glb"],
    results: [study(written)],
  },
];

/** The folder's model, last built at `updated` (null before the engine has built it). */
const models = (updated: string | null, root = ROOT) =>
  new Map<string, ReadonlyArray<ProjectModel>>([
    [
      root,
      [
        {
          id: ID,
          name: "bracket",
          script: "parts/bracket.py",
          kind: "Part",
          updated: updated === null ? null : seconds(updated),
        },
      ],
    ],
  ]);

const RESULT = `${ROOT}/FEA/bracket.fea.glb`;

describe("a check's result on screen, of a part changed since", () => {
  it("is out of date once its part was built after it was written", () => {
    expect(shownResultOutOfDate(folders(CHECKED), models("2026-10-01T12:05:00.000Z"), RESULT)).toBe(
      true,
    );
  });

  it("is current while its part is as it was checked", () => {
    expect(shownResultOutOfDate(folders(CHECKED), models("2026-10-01T11:00:00.000Z"), RESULT)).toBe(
      false,
    );
  });

  it("says nothing of a result whose file names no time", () => {
    expect(shownResultOutOfDate(folders(), models("2026-10-01T12:05:00.000Z"), RESULT)).toBe(false);
  });

  it("says nothing of a part the engine has not built, or does not list", () => {
    expect(shownResultOutOfDate(folders(CHECKED), models(null), RESULT)).toBe(false);
    expect(shownResultOutOfDate(folders(CHECKED), new Map(), RESULT)).toBe(false);
  });

  it("says nothing of a file that is no check's result", () => {
    expect(shownResultOutOfDate(folders(CHECKED), models("2026-10-01T12:05:00.000Z"), ID)).toBe(
      false,
    );
    expect(
      shownResultOutOfDate(
        folders(CHECKED),
        models("2026-10-01T12:05:00.000Z"),
        `${ROOT}/parts/lid.step`,
      ),
    ).toBe(false);
  });

  it("finds the result in a Windows folder", () => {
    const root = "C:\\work\\bracket";
    expect(
      shownResultOutOfDate(
        folders(CHECKED, root),
        models("2026-10-01T12:05:00.000Z", root),
        "C:\\work\\bracket\\FEA\\bracket.fea.glb",
      ),
    ).toBe(true);
  });

  it("counts a study run on a copy for the part it is about", () => {
    const copy = { ...study(CHECKED), part: "stopped-bracket.step", onStudyCopy: true as const };
    const onCopy: ReadonlyArray<FolderChecks> = [{ ...folders(CHECKED)[0]!, results: [copy] }];
    expect(shownResultOutOfDate(onCopy, models("2026-10-01T12:05:00.000Z"), RESULT)).toBe(true);
    expect(shownResultOutOfDate(onCopy, models("2026-10-01T11:00:00.000Z"), RESULT)).toBe(false);
  });
});
