import type { EnvironmentProject } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";

import { useNowMinute } from "~/hooks/useNowMinute";
import { useSidebar } from "../ui/sidebar";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { StudioNav } from "./StudioTopBar";
import { useStudioProjectAt } from "./useStudioProjects";
import { workspaceTitle } from "./workspaceTitle";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The start of a project workspace's top bar, in the chat's header row: Studio's mark (Home), then
 * the project's name, which switches projects (`ProjectSwitcher`, marked New on its first day).
 * While the project's chats show down the left (`StudioSidebar`, folded away by the sidebar's own
 * toggle or its shortcut), the mark is at their top instead. The panel's row carries the rest
 * (`StudioPanelBar`).
 */
export function StudioWorkspaceBar(props: {
  readonly environmentId: EnvironmentId;
  readonly project: EnvironmentProject | null;
}) {
  const folder = props.project?.workspaceRoot ?? null;
  const studio = useStudioProjectAt(props.environmentId, folder);
  const now = Date.parse(`${useNowMinute()}:00Z`);
  const title = workspaceTitle(studio?.project.name ?? props.project?.title ?? null, folder);
  const isNew = studio !== null && now - Date.parse(studio.project.createdAt) < DAY_MS;
  const { isMobile, open } = useSidebar();
  const chatsShown = open && !isMobile;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {chatsShown ? null : (
        <>
          <StudioNav compact />
          <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-border" />
        </>
      )}
      <ProjectSwitcher
        environmentId={props.environmentId}
        folder={folder}
        title={title}
        isNew={isNew}
      />
    </div>
  );
}
