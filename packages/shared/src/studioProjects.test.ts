import type { StudioProject } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  EMPTY_STUDIO_BRIEF,
  studioOtherFolders,
  studioProjectAt,
  studioProjectContext,
} from "./studioProjects.ts";

const rover: StudioProject = {
  name: "Rover arm",
  template: "robot",
  brief: {
    ...EMPTY_STUDIO_BRIEF,
    purpose: "A three-joint arm for the rover deck.",
    material: "6061-T6 aluminum",
    process: "CNC machining",
  },
  folders: ["/work/rover-cad", "/work/rover-board/", "/work/rover-firmware"],
  createdAt: "2026-10-14T00:00:00.000Z",
};

describe("studio projects", () => {
  it("finds a folder's project whatever trailing slash either side has", () => {
    expect(studioProjectAt({ a: rover }, "/work/rover-board")?.id).toBe("a");
    expect(studioProjectAt({ a: rover }, "/work/rover-cad/")?.project.name).toBe("Rover arm");
    expect(studioProjectAt({ a: rover }, "/work/rover")).toBeNull();
    expect(studioOtherFolders(rover, "/work/rover-board")).toEqual([
      "/work/rover-cad",
      "/work/rover-firmware",
    ]);
  });

  it("tells the agent the folders, marks its own, and leaves out what the brief does not say", () => {
    const context = studioProjectContext(rover, "/work/rover-firmware");
    expect(context).toContain("# Studio project: Rover arm");
    expect(context).toContain("- `/work/rover-firmware` (this thread's folder)");
    expect(context).toContain("- `/work/rover-cad`\n");
    expect(context).toContain("Work in mm");
    expect(context).toContain("- Material: 6061-T6 aluminum");
    expect(context).toContain("- Quantity: Not decided");
    expect(context).toContain("In `/work/rover-cad`, keep the project's work");
    expect(context).toContain("- `robots/`: robot descriptions (URDF, SRDF, SDF)");
    expect(context).not.toContain("## Requirements");
    expect(context).toContain("## Show your work");
    expect(context).toContain("round them up in a short report in `docs/`");
    expect(studioProjectContext({ ...rover, template: "blank" }, "/work/rover-cad")).not.toContain(
      "## Where work goes",
    );
  });
});
