import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { describe, expect, it } from "vite-plus/test";

import {
  describeCounts,
  freshFiles,
  type ImportFile,
  needsALook,
  placeName,
  planImport,
  projectNameFromFolder,
  suggestProject,
  whereFilesAre,
} from "./importPlan";

const file = (path: string, kind: ImportFile["kind"], size = 10, modifiedMs = 1): ImportFile => ({
  path,
  kind,
  size,
  modifiedMs,
});

describe("planImport", () => {
  it("proposes a project for each folder under a root that holds models or drawings", () => {
    const plan = planImport(
      [
        {
          root: "/Users/amy/Documents",
          files: [
            file("/Users/amy/Documents/Kawarobo/Mini/gear.step", "model"),
            file("/Users/amy/Documents/Kawarobo/robot BOM.xlsx", "partsList"),
            file("/Users/amy/Documents/Kawarobo/IMG_1.jpg", "photo"),
            file("/Users/amy/Documents/taxes/receipt.pdf", "notes"),
            file("/Users/amy/Documents/servo-bracket/bracket_drawing.pdf", "drawing"),
          ],
        },
      ],
      new Set(),
    );
    expect(
      plan.projects.map((project) => [project.folder, project.name, project.files.length]),
    ).toEqual([
      ["/Users/amy/Documents/Kawarobo", "Kawarobo", 3],
      ["/Users/amy/Documents/servo-bracket", "Servo bracket", 1],
    ]);
    expect(plan.loose).toEqual([]);
  });

  it("leaves models right in a root to be sorted, and skips folders already in Studio", () => {
    const plan = planImport(
      [
        {
          root: "/Users/amy/Downloads",
          files: [
            file("/Users/amy/Downloads/arm v2.step", "model"),
            file("/Users/amy/Downloads/manual.pdf", "notes"),
            file("/Users/amy/Downloads/clip/clip.step", "model"),
          ],
        },
      ],
      new Set([studioFolderKey("/Users/amy/Downloads/clip")]),
    );
    expect(plan.projects).toEqual([]);
    expect(plan.loose.map((entry) => entry.path)).toEqual(["/Users/amy/Downloads/arm v2.step"]);
  });

  it("takes a dropped folder as a project and dropped files as loose", () => {
    const plan = planImport(
      [
        { root: "/drop/Sumo robot", files: [file("/drop/Sumo robot/wheel.step", "model")] },
        { root: "/drop/gear guard.step", files: [file("/drop/gear guard.step", "model")] },
      ],
      new Set(),
      { rootsAreProjects: true },
    );
    expect(plan.projects.map((project) => project.folder)).toEqual(["/drop/Sumo robot"]);
    expect(plan.loose.map((entry) => entry.path)).toEqual(["/drop/gear guard.step"]);
  });
});

describe("needsALook", () => {
  it("finds copies and older versions, keeping the newest", () => {
    const files = [
      file("/a/gear.step", "model", 100, 1),
      file("/b/gear.step", "model", 100, 2),
      file("/a/arm v1.step", "model", 50, 1),
      file("/a/arm v2.step", "model", 60, 5),
      file("/a/wheel.step", "model", 70, 1),
    ];
    const look = needsALook(files);
    expect(look.duplicates.map((entry) => entry.path)).toEqual(["/a/gear.step"]);
    expect(look.oldVersions.map((entry) => entry.path)).toEqual(["/a/arm v1.step"]);
  });
});

describe("suggestProject", () => {
  it("matches a loose file to a project by a shared word", () => {
    const projects = [{ name: "Sumo robot" }, { name: "Servo bracket" }];
    expect(suggestProject("/Downloads/servo_bracket_v3.step", projects)).toBe(1);
    expect(suggestProject("/Downloads/random.step", projects)).toBeNull();
  });
});

describe("naming and counting", () => {
  it("names a project after its folder in plain words", () => {
    expect(projectNameFromFolder("/p/sumo-robot")).toBe("Sumo robot");
    expect(projectNameFromFolder("/p/Kawarobo/")).toBe("Kawarobo");
  });

  it("says what a project holds", () => {
    expect(
      describeCounts([
        file("/a.step", "model"),
        file("/b.step", "model"),
        file("/bom.xlsx", "partsList"),
        file("/x.jpg", "photo"),
      ]),
    ).toBe("2 models, 1 parts list, 1 photo");
    expect(describeCounts([])).toBe("Nothing yet");
  });
});

describe("new files since a scan", () => {
  const files = [
    file("/Users/amy/Downloads/gear guard.step", "model", 10, 500),
    file("/Users/amy/Downloads/old.step", "model", 10, 50),
    file("/Users/amy/Downloads/manual.pdf", "notes", 10, 500),
    file("/Users/amy/Downloads/clip/clip v2.step", "model", 10, 500),
  ];

  it("keeps models and drawings changed since, outside Studio's folders", () => {
    const fresh = freshFiles(files, 100, [studioFolderKey("/Users/amy/Downloads/clip")]);
    expect(fresh.map((entry) => entry.path)).toEqual(["/Users/amy/Downloads/gear guard.step"]);
  });

  it("names the folder they are in", () => {
    expect(whereFilesAre(["/Users/amy/Documents", "/Users/amy/Downloads"], files)).toBe(
      "Downloads",
    );
    expect(whereFilesAre(["/Users/amy/Documents"], files)).toBe("your folders");
  });
});

describe("placeName", () => {
  it("names the scanned folder something is in, else its parent", () => {
    const roots = ["/Users/amy/Documents", "/Users/amy/Downloads"];
    expect(placeName("/Users/amy/Documents/Kawarobo", roots)).toBe("Documents");
    expect(placeName("/Users/amy/Downloads/arm v2.step", roots)).toBe("Downloads");
    expect(placeName("/Volumes/Work/robots/Sumo", roots)).toBe("robots");
  });
});
