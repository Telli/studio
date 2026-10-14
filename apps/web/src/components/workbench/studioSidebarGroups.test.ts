import {
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  type StudioProject,
} from "@t3tools/contracts";
import { EMPTY_STUDIO_BRIEF } from "@t3tools/shared/studioProjects";
import { describe, expect, it } from "vite-plus/test";

import { buildSidebarProjectSnapshots } from "~/sidebarProjectGrouping";
import type { Project } from "~/types";
import { mergeStudioProjectGroups } from "./studioSidebarGroups";

const environmentId = EnvironmentId.make("env-primary");

function folder(name: string): Project {
  return {
    id: ProjectId.make(name),
    environmentId,
    title: name,
    workspaceRoot: `/work/${name}`,
    repositoryIdentity: null,
    defaultModelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5-codex" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    scripts: [],
  };
}

const rover: StudioProject = {
  name: "Rover arm",
  template: "robot",
  brief: EMPTY_STUDIO_BRIEF,
  folders: ["/work/rover-cad", "/work/rover-firmware/"],
  createdAt: "2026-10-14T00:00:00.000Z",
};

describe("mergeStudioProjectGroups", () => {
  it("makes a project's folders one entry named for it, where its first folder stood", () => {
    const groups = buildSidebarProjectSnapshots({
      projects: [
        folder("bench-psu"),
        folder("rover-cad"),
        folder("notes"),
        folder("rover-firmware"),
      ],
      settings: { sidebarProjectGroupingMode: "separate", sidebarProjectGroupingOverrides: {} },
      primaryEnvironmentId: environmentId,
      resolveEnvironmentLabel: () => null,
    });
    const merged = mergeStudioProjectGroups(groups, { rover }, environmentId);

    expect(merged.map((group) => group.displayName)).toEqual(["bench-psu", "Rover arm", "notes"]);
    const project = merged[1]!;
    expect(project.projectKey).toBe(groups[1]!.projectKey);
    expect(project.memberProjects.map((member) => member.title)).toEqual([
      "rover-cad",
      "rover-firmware",
    ]);
    expect(project.memberProjectRefs.map((ref) => ref.projectId)).toEqual([
      "rover-cad",
      "rover-firmware",
    ]);
    expect(project.groupedProjectCount).toBe(2);
  });

  it("leaves the sidebar alone when no folder is in a project", () => {
    const groups = buildSidebarProjectSnapshots({
      projects: [folder("bench-psu")],
      settings: { sidebarProjectGroupingMode: "separate", sidebarProjectGroupingOverrides: {} },
      primaryEnvironmentId: environmentId,
      resolveEnvironmentLabel: () => null,
    });
    expect(mergeStudioProjectGroups(groups, { rover }, environmentId)).toEqual(groups);
  });
});
