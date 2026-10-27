import { STUDIO_PROJECT_KINDS } from "@t3tools/shared/studioProjects";
import { describe, expect, it } from "vite-plus/test";

import { newProjectBrief } from "./newProjectBrief";

const PART = STUDIO_PROJECT_KINDS.find((kind) => kind.id === "part")!;

describe("newProjectBrief", () => {
  it("uses the process it is given, not the kind's", () => {
    const brief = newProjectBrief({
      kind: PART,
      units: "mm",
      material: " Aluminium 6061-T6, 10 mm plate ",
      purpose: "A plate.",
      process: "CNC machining",
    });
    expect(brief).toMatchObject({
      units: "mm",
      material: "Aluminium 6061-T6, 10 mm plate",
      process: "CNC machining",
      purpose: "A plate.",
    });
  });

  it("keeps the kind's process when none is given or it is blank", () => {
    const base = { kind: PART, units: "mm", material: "", purpose: "" } as const;
    expect(newProjectBrief(base).process).toBe(PART.process);
    expect(newProjectBrief({ ...base, process: "  " }).process).toBe(PART.process);
  });
});
