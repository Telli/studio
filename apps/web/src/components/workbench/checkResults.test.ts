import { describe, expect, it } from "vite-plus/test";

import {
  isCheckResultPath,
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
      check: "FEA",
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

  it("asks the agent to propose a fix and wait, never to change the part", () => {
    const result = parseCheckResult("bossbar.casting.result.json", casting)!;
    expect(proposeFixPrompt(result, result.issues[0]!)).toBe(
      "The casting check on bossbar.step found: An isolated hot spot in the boss freezes last. " +
        "The check suggests: Feed it from #o1.f7: a riser of modulus 2.9 mm. " +
        "Propose a fix: say what you would change and why, then wait for my go before changing the part.",
    );
  });
});
