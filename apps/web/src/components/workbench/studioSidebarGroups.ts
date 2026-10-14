import type { EnvironmentId, StudioProject } from "@t3tools/contracts";
import { studioProjectAt } from "@t3tools/shared/studioProjects";
import { useMemo } from "react";

import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEngineeringInterface } from "./studioInterface";
import { useStudioProjects } from "./useStudioProjects";

/**
 * The sidebar's folders gathered into Studio projects: every folder of a
 * project becomes one entry named for the project, holding all their
 * threads, where its first folder stood. Folders in no project, and folders
 * on other environments, stay as they are. The entry keeps its first
 * folder's key, so its order, folding and settings stay that folder's.
 */
export function mergeStudioProjectGroups(
  groups: ReadonlyArray<SidebarProjectSnapshot>,
  projects: Readonly<Record<string, StudioProject>>,
  environmentId: EnvironmentId,
): SidebarProjectSnapshot[] {
  const merged: SidebarProjectSnapshot[] = [];
  const indexById = new Map<string, number>();
  for (const group of groups) {
    const member = group.isScratch
      ? undefined
      : group.memberProjects.find((project) => project.environmentId === environmentId);
    const match = member === undefined ? null : studioProjectAt(projects, member.workspaceRoot);
    if (match === null) {
      merged.push(group);
      continue;
    }
    const index = indexById.get(match.id);
    if (index === undefined) {
      indexById.set(match.id, merged.length);
      merged.push({ ...group, displayName: match.project.name });
      continue;
    }
    const into = merged[index]!;
    merged[index] = {
      ...into,
      groupedProjectCount: into.groupedProjectCount + group.groupedProjectCount,
      environmentPresence:
        into.environmentPresence === group.environmentPresence ? into.environmentPresence : "mixed",
      allRemoteMembersAreDesktopLocal:
        into.allRemoteMembersAreDesktopLocal && group.allRemoteMembersAreDesktopLocal,
      allRemoteMembersAreWsl: into.allRemoteMembersAreWsl && group.allRemoteMembersAreWsl,
      memberProjects: [...into.memberProjects, ...group.memberProjects],
      memberProjectRefs: [...into.memberProjectRefs, ...group.memberProjectRefs],
      remoteEnvironmentLabels: [
        ...new Set([...into.remoteEnvironmentLabels, ...group.remoteEnvironmentLabels]),
      ],
    };
  }
  return merged;
}

/** The sidebar's groups, gathered into Studio projects in the engineering interface. */
export function useStudioSidebarGroups(
  groups: ReadonlyArray<SidebarProjectSnapshot>,
): ReadonlyArray<SidebarProjectSnapshot> {
  const engineering = useEngineeringInterface();
  const environmentId = usePrimaryEnvironmentId();
  const projects = useStudioProjects(engineering ? environmentId : null);
  return useMemo(
    () =>
      engineering && environmentId !== null && Object.keys(projects).length > 0
        ? mergeStudioProjectGroups(groups, projects, environmentId)
        : groups,
    [engineering, environmentId, groups, projects],
  );
}
