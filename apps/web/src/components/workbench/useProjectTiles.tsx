import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { type ReactNode, useMemo } from "react";

import type { ListedProject } from "./projectList";
import { whenTouched } from "./ProjectChoices";
import { useProjectMenu } from "./ProjectMenu";
import { ProjectTile } from "./ProjectTile";
import { needsYou } from "./recentActivity";
import { useOpenProject } from "./useOpenProject";

/**
 * Projects as tiles, the one way Home and the Projects page show them: each pictured by its part,
 * with when it was last opened or worked on, the chats waiting on the person, and its menu, as
 * Drive's on a file (`useProjectMenu`). Opening one goes where it was left, or to the chat waiting
 * on the person (`useOpenProject`). The page renders `dialogs` once, for the menu's.
 */
export function useProjectTiles(
  environmentId: EnvironmentId,
  cards: ReadonlyArray<ListedProject>,
): { readonly tile: (card: ListedProject) => ReactNode; readonly dialogs: ReactNode } {
  const openProject = useOpenProject();
  const waiting = useMemo(() => {
    const byProject = new Map<string, EnvironmentThreadShell[]>();
    for (const { card, thread } of needsYou(cards)) {
      byProject.set(card.id, [...(byProject.get(card.id) ?? []), thread]);
    }
    return byProject;
  }, [cards]);
  const menu = useProjectMenu({
    environmentId,
    cards,
    ownStar: true,
    onOpen: (card) => void openProject(card.folder, card.threads),
  });
  const tile = (card: ListedProject) => (
    <ProjectTile
      key={card.id}
      environmentId={environmentId}
      id={card.id}
      project={card.project}
      threads={card.threads}
      waiting={waiting.get(card.id) ?? []}
      when={whenTouched(card)}
      onOpen={() => void openProject(card.folder, card.threads)}
      onMenu={(position) => menu.show(card, position)}
    />
  );
  return { tile, dialogs: menu.dialogs };
}
