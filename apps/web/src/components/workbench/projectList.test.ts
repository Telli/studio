import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { EMPTY_BRIEF } from "./briefFolder";
import { listProjects } from "./projectList";

const env = "local" as EnvironmentId;
const folder = (id: string, workspaceRoot: string) =>
  ({
    id,
    environmentId: env,
    workspaceRoot,
    title: id,
    createdAt: "2026-10-01T00:00:00.000Z",
  }) as unknown as EnvironmentProject;
const thread = (id: string, projectId: string, updatedAt: string, archived = false) =>
  ({
    id,
    environmentId: env,
    projectId,
    updatedAt,
    archivedAt: archived ? updatedAt : null,
  }) as unknown as EnvironmentThreadShell;
const project = (name: string, folders: string[]): StudioProject => ({
  name,
  template: null,
  brief: EMPTY_BRIEF,
  folders,
  createdAt: "2026-10-02T00:00:00.000Z",
});

describe("project list", () => {
  it("gathers a project's threads from all its folders, newest project first", () => {
    const { cards, loose } = listProjects(
      {
        rover: project("Rover arm", ["/w/rover-cad", "/w/rover-firmware"]),
        lamp: project("Desk lamp", ["/w/lamp"]),
      },
      [
        folder("cad", "/w/rover-cad"),
        folder("fw", "/w/rover-firmware/"),
        folder("lamp", "/w/lamp"),
        folder("misc", "/w/misc"),
      ],
      [
        thread("t1", "cad", "2026-10-10T00:00:00.000Z"),
        thread("t2", "fw", "2026-10-12T00:00:00.000Z"),
        thread("t3", "lamp", "2026-10-14T00:00:00.000Z"),
        thread("t4", "lamp", "2026-10-15T00:00:00.000Z", true),
        thread("t5", "misc", "2026-10-11T00:00:00.000Z"),
      ],
      env,
    );
    expect(
      cards.map((card) => [card.project.name, card.folder?.id, card.threads.map((t) => t.id)]),
    ).toEqual([
      ["Desk lamp", "lamp", ["t3"]],
      ["Rover arm", "cad", ["t1", "t2"]],
    ]);
    expect(cards[1]?.folders.map((record) => record.id)).toEqual(["cad", "fw"]);
    expect(loose.map((entry) => [entry.folder.id, entry.latest])).toEqual([
      ["misc", "2026-10-11T00:00:00.000Z"],
    ]);
  });
});
