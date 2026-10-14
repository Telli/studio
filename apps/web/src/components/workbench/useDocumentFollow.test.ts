import type { OrchestrationV2TurnItem } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { writtenDocuments } from "./useDocumentFollow";

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
