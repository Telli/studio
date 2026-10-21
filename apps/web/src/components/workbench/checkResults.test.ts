import { describe, expect, it } from "vite-plus/test";

import {
  drawingsFor,
  isCheckResultPath,
  isNamedStudyPath,
  manufacturingFor,
  overviewParts,
  parseCheckResult,
  proposeFixPrompt,
  resultsFor,
  worstStatus,
} from "./checkResults";
import { classifyProjectFile, type ProjectFile } from "./projectFiles";

const casting = JSON.stringify({
  document: "/work/demo/bossbar.step",
  analysis: "casting",
  findings: [
    {
      check: "casting",
      severity: "info",
      type: "thinnest_section",
      summary: "The thinnest section is solid through at 20.8 s",
    },
    {
      check: "casting",
      severity: "warning",
      type: "low_niyama",
      summary: "Niyama falls to 0.044 near the boss",
      fix: { action: "add_feeder", summary: "Feed it from #o1.f7" },
    },
    {
      check: "casting",
      severity: "error",
      type: "shrinkage_hot_spot",
      summary: "An isolated hot spot in the boss freezes last.",
      fix: { action: "add_feeder", summary: "Feed it from #o1.f7: a riser of modulus 2.9 mm." },
    },
  ],
  verdict: { status: "fix", headline: "1 to fix · shrinkage hot spot", errors: 1, warnings: 1 },
});

// An FEA result from before verdicts: its status comes from its findings.
const fea = JSON.stringify({
  document: "field-test-asm/rover_mount.step",
  findings: [
    {
      check: "fea",
      severity: "warning",
      type: "low_margin",
      summary: "Safety factor 1.4 at the boss",
    },
  ],
});

const file = (path: string): ProjectFile => classifyProjectFile(path)!;

describe("check results", () => {
  it("reads FEA and manufacturing results, and nothing else", () => {
    expect(
      [
        "bossbar.casting.result.json",
        "out/mount.fea.json",
        "bossbar.casting.json",
        "bossbar.step",
        "package.json",
      ].map(isCheckResultPath),
    ).toEqual([true, true, false, false, false]);
  });

  it("names the part, the check, its verdict and its issues, errors first", () => {
    expect(parseCheckResult("out/bossbar.casting.result.json", casting)).toEqual({
      path: "out/bossbar.casting.result.json",
      model: "out/bossbar.casting.glb",
      part: "bossbar.step",
      check: "Casting",
      status: "fix",
      headline: "1 to fix · shrinkage hot spot",
      issues: [
        {
          severity: "error",
          summary: "An isolated hot spot in the boss freezes last.",
          fix: "Feed it from #o1.f7: a riser of modulus 2.9 mm.",
        },
        {
          severity: "warning",
          summary: "Niyama falls to 0.044 near the boss",
          fix: "Feed it from #o1.f7",
        },
      ],
    });
  });

  it("judges a result without a verdict by its findings", () => {
    const result = parseCheckResult("mount.fea.json", fea);
    expect(result).toMatchObject({
      model: "mount.fea.glb",
      part: "rover_mount.step",
      check: "Strength",
      status: "warnings",
      headline: "Safety factor 1.4 at the boss",
    });
    const passed = parseCheckResult(
      "plate.heat_treatment.result.json",
      JSON.stringify({ findings: [], verdict: { status: "ready", headline: "Ready to quench" } }),
    );
    expect(passed).toMatchObject({
      part: "plate",
      check: "Heat treatment",
      status: "ready",
      headline: "Ready to quench",
    });
  });

  it("skips a file that is not a result, or is still being written", () => {
    expect(parseCheckResult("a.result.json", '{"findings": [')).toBeNull();
    expect(parseCheckResult("a.result.json", '{"files": {}}')).toBeNull();
  });

  it("lists each part once, a mesh beside its STEP folded in, and finds its results", () => {
    const files = [
      "bossbar.step",
      "bossbar.stl",
      "lid.stl",
      "plate.step",
      "bossbar.casting.glb",
      "board/main.kicad_pcb",
    ].map(file);
    const parts = overviewParts(files);
    expect(parts.map((part) => part.path)).toEqual([
      "bossbar.step",
      "lid.stl",
      "plate.step",
      "board/main.kicad_pcb",
    ]);

    const results = [
      parseCheckResult("bossbar.casting.result.json", casting)!,
      parseCheckResult(
        "plate.heat_treatment.result.json",
        JSON.stringify({ findings: [], verdict: { status: "ready", headline: "Ready" } }),
      )!,
    ];
    expect(resultsFor(parts[0]!, results).map((result) => result.check)).toEqual(["Casting"]);
    expect(resultsFor(parts[2]!, results).map((result) => result.check)).toEqual([
      "Heat treatment",
    ]);
    expect(resultsFor(parts[1]!, results)).toEqual([]);
    expect(worstStatus(results)).toBe("fix");
    expect(worstStatus([])).toBeNull();
  });

  it("lists a SolidCraft design once, pictured by its STEP and checked through it", () => {
    const files = [
      "parts/plate.solidcraft",
      "parts/plate.step",
      "parts/plate.glb",
      "parts/arm.step",
    ]
      .map(classifyProjectFile)
      .filter((file): file is ProjectFile => file !== null);
    const parts = overviewParts(files);
    expect(parts.map((part) => [part.name, part.kind, part.picture])).toEqual([
      ["plate.solidcraft", "Design", "parts/plate.step"],
      ["arm.step", "Part", undefined],
    ]);
    const result = parseCheckResult(
      "parts/plate.fea.json",
      JSON.stringify({ document: "plate.step", findings: [] }),
    )!;
    expect(resultsFor(parts[0]!, [result])).toHaveLength(1);
    expect(resultsFor(parts[1]!, [result])).toHaveLength(0);
  });

  it("names an FEA study's check as the engineer says it, with its safety factor when it passes", () => {
    // As `cadgen fea solve` writes it: the check's label, the safety factor, and its picture.
    const passed = parseCheckResult(
      "FEA/bracket.bracket-load.json",
      JSON.stringify({
        generator: "cadgen fea",
        document: "bracket.step",
        study: { material: "aluminum-6061-t6" },
        summary: { safety_factor: 3.24, checks: [{ kind: "stress", label: "Strength" }] },
        files: { glb: "bracket.bracket-load.glb" },
        findings: [],
      }),
    );
    expect(passed).toMatchObject({
      model: "FEA/bracket.bracket-load.glb",
      part: "bracket.step",
      check: "Strength",
      status: "ready",
      headline: "Holds the load, safety factor 3.2",
    });
    const modal = parseCheckResult(
      "plate.fea.json",
      JSON.stringify({ document: "plate.step", study: { analysis: "modal" }, findings: [] }),
    );
    expect(modal?.check).toBe("Vibration");
    // A named study is found beside its picture; a JSON with none is not a study.
    const folder = new Set([
      "FEA/bracket.bracket-load.json",
      "FEA/bracket.bracket-load.glb",
      "package.json",
      "data.v2.json",
    ]);
    expect([...folder].map((path) => isNamedStudyPath(path, folder))).toEqual([
      true,
      false,
      false,
      false,
    ]);
  });

  it("finds a part's drawing sheet, wherever it is filed", () => {
    const part = file("parts/bracket.step");
    expect(
      drawingsFor(part, [
        "drawings/bracket_drawing.pdf",
        "parts/bracket_drawing.py",
        "drawings/bracket_mount_drawing.pdf",
        "docs/bracket.pdf",
      ]),
    ).toEqual(["drawings/bracket_drawing.pdf"]);
  });

  it("gives each manufacturing file to the part it was made from", () => {
    const parts = [
      "parts/bracket.step",
      "parts/bracket_v2.step",
      "v1/plate.step",
      "v2/plate.step",
      "electronics/servo_power.kicad_pcb",
    ].map(file);
    const made = manufacturingFor(parts, [
      ...parts,
      ...[
        "cam/bracket.cam.glb",
        "cam/bracket.cam.json",
        "cam/bracket_v2.nc",
        "v2/out/plate.nc",
        "electronics/servo_power.gerbers.zip",
        "electronics/servo_power.bom.csv",
        "electronics/gerbers.zip",
        "cam/bracketry.nc",
        "drawings/bracket_drawing.pdf",
      ].map(file),
    ]);
    const names = (path: string) => made.get(path)?.map((entry) => entry.path) ?? [];
    expect(names("parts/bracket.step")).toEqual(["cam/bracket.cam.glb", "cam/bracket.cam.json"]);
    expect(names("parts/bracket_v2.step")).toEqual(["cam/bracket_v2.nc"]);
    expect(names("v1/plate.step")).toEqual([]);
    expect(names("v2/plate.step")).toEqual(["v2/out/plate.nc"]);
    expect(names("electronics/servo_power.kicad_pcb")).toEqual([
      "electronics/servo_power.gerbers.zip",
      "electronics/servo_power.bom.csv",
    ]);
  });

  it("asks the agent to propose a fix and wait, never to change the part", () => {
    const result = parseCheckResult("bossbar.casting.result.json", casting)!;
    expect(proposeFixPrompt(result, result.issues[0]!)).toBe(
      "The casting check on bossbar.step found: An isolated hot spot in the boss freezes last. " +
        "The check suggests: Feed it from #o1.f7: a riser of modulus 2.9 mm. " +
        "Propose a fix: say what you would change and why, then wait for my go before changing the part.",
    );
    expect(
      proposeFixPrompt(result, result.issues[0]!, "[bossbar.step](parts/bossbar.step)"),
    ).toMatch(/^The casting check on \[bossbar\.step\]\(parts\/bossbar\.step\) found: /);
  });
});
