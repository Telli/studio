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
    expect(context).toContain("## Sketches the person can edit");
    expect(context).toContain(
      "Draw every 2D profile you extrude, revolve, cut, sweep or loft with `cadgen.sketch`",
    );
    expect(context).toContain("Call parts and documents by their names");
    expect(context).toContain("round them up in a short report in `docs/`");
    expect(studioProjectContext({ ...rover, template: "blank" }, "/work/rover-cad")).not.toContain(
      "## Where work goes",
    );
    expect(context).not.toContain("## Changing the setup");
  });

  it("asks the agent to keep the README's decisions and to start a new project with a few questions", () => {
    const context = studioProjectContext(rover, "/work/rover-cad", "/studio/rover/project.json");
    expect(context).toContain("## The README");
    expect(context).toContain("`## Decisions`");
    expect(context).toContain("(<YYYY-MM-DD>, asked)");
    expect(context).toContain("`- Support the bike by its front wheel (2026-10-19, asked)`");
    expect(context).toContain("Studio shows every section.");
    expect(context).toContain("## Starting a project");
    expect(context).toContain("as `name` in `/studio/rover/project.json`");
    expect(context).toContain("at most three short questions");
    expect(context).toContain("before any research or modelling");
    expect(context).toContain("a printer named means 3D printing");
    expect(context).toContain("add its decision line to the README in the same turn");
    expect(studioProjectContext(rover, "/work/rover-cad")).not.toContain("as `name` in");
    expect(studioProjectContext(rover, "/work/rover-cad")).toContain(
      "- Write `README.md` as above",
    );
  });

  it("tells the agent where the setup is kept, and to propose what it means before changing parts", () => {
    const context = studioProjectContext(rover, "/work/rover-cad", "/studio/rover/project.json");
    expect(context).toContain("## Changing the setup");
    expect(context).toContain("kept in `/studio/rover/project.json`");
    expect(context).toContain('"Casting"');
    expect(context).toContain("wait\nfor a go before changing any part");
  });
});
