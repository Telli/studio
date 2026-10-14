import { describe, expect, it } from "vite-plus/test";

import { documentTitle, documentType } from "./DocumentHeader";

describe("document header", () => {
  it("titles a document by its first heading, else its file name", () => {
    expect(documentTitle("Intro\n\n# Bracket **rev B** plan\n\n## Steps", "plans/x.md")).toBe(
      "Bracket rev B plan",
    );
    expect(documentTitle("no heading here", "reports/fea-summary.md")).toBe("fea-summary");
  });

  it("files a document by its name", () => {
    expect(documentType("PLAN.md")).toBe("Plan");
    expect(documentType("brief/project.md")).toBe("Brief");
    expect(documentType("reports/cnc-check.md")).toBe("Report");
    expect(documentType("notes.md")).toBe("Document");
  });
});
