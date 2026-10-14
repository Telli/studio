import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { bestOutput, pickFollow, writtenDocuments } from "./useDocumentFollow";

const edit = (paths: Array<[string, string]>) =>
  ({
    type: "file_change",
    status: "completed",
    fileName: paths[0]?.[0] ?? "",
    changes: paths.map(([path, operation]) => ({ path, operation })),
  }) as unknown as OrchestrationV2TurnItem;

describe("document follow", () => {
  it("opens the plans and reports the agent writes, workspace-relative", () => {
    expect(
      writtenDocuments(
        edit([
          ["/work/plans/bracket.md", "add"],
          ["/work/src/bracket.py", "update"],
          ["/work/reports/fea.pdf", "add"],
        ]),
        "/work",
      ),
    ).toEqual(["plans/bracket.md", "reports/fea.pdf"]);
  });

  it("leaves instruction files, tool folders and deletions alone", () => {
    expect(
      writtenDocuments(
        edit([
          ["/work/AGENTS.md", "update"],
          ["/work/.claude/notes.md", "add"],
          ["/work/old-plan.md", "delete"],
          ["/elsewhere/plan.md", "add"],
        ]),
        "/work",
      ),
    ).toEqual([]);
  });
});

describe("output follow", () => {
  it("opens the best thing a run made: a document, then a table or G-code, then a picture", () => {
    expect(
      bestOutput(["src/bracket.py", "out/bracket.png", "out/bracket.nc", "plans/review.md"]),
    ).toBe("plans/review.md");
    expect(bestOutput(["PCB/board.bom.csv", "PCB/board.gerbers.zip", "src/board.py"])).toBe(
      "PCB/board.bom.csv",
    );
    expect(
      bestOutput(["src/bracket.py", "pyproject.toml", ".venv/x.md", "brief/brief.json"]),
    ).toBeNull();
  });
});

describe("one thing per run", () => {
  const viewer = (path: string) => /\.(?:step|glb|kicad_pcb|dxf)$/i.test(path);
  const none = () => false;

  it("opens a report over a result, a result over a model, a model over a table", () => {
    const made = [
      "parts/bracket.step",
      "parts/bracket.fea.glb",
      "out/bom.csv",
      "docs/bracket-strength.md",
    ];
    expect(pickFollow(made, viewer, none)).toEqual({
      kind: "file",
      path: "docs/bracket-strength.md",
    });
    expect(pickFollow(made.slice(0, 3), viewer, none)).toEqual({
      kind: "viewer",
      path: "parts/bracket.fea.glb",
    });
    expect(pickFollow(["out/bom.csv", "parts/bracket.step"], viewer, none)).toEqual({
      kind: "viewer",
      path: "parts/bracket.step",
    });
    expect(pickFollow(["out/bracket.png", "out/bom.csv"], viewer, none)).toEqual({
      kind: "file",
      path: "out/bom.csv",
    });
  });

  it("leaves what the viewer already shows, and source and tool files, alone", () => {
    const showing = (path: string) => path === "parts/bracket.step";
    expect(pickFollow(["parts/bracket.step", "src/bracket.py"], viewer, showing)).toBeNull();
    expect(pickFollow([".claude/plan.md", "AGENTS.md", "pyproject.toml"], viewer, none)).toBeNull();
  });
});
