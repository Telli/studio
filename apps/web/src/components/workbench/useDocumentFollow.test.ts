import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { bestOutput, writtenDocuments } from "./useDocumentFollow";

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
