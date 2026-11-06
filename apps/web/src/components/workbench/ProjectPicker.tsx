import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { PROJECT_ROW_CLASS, ProjectChoices, ProjectThumb } from "./ProjectChoices";
import type { ListedProject } from "./projectList";
import { workspaceTitle } from "./workspaceTitle";

/**
 * Where Home's box sends what is typed: a new project, as it starts, or a chat in a project of
 * yours. In the box it is one quiet line, as Attach beside it is (the project's picture or a +,
 * its name, or Project until one is chosen, beside Start project; the switcher's chevrons); its
 * list is the project switcher's own (`ProjectChoices`), with New project at its head.
 */
export function ProjectPicker(props: {
  readonly environmentId: EnvironmentId;
  readonly cards: ReadonlyArray<ListedProject>;
  /** The project chosen; null for a new one. */
  readonly chosen: ListedProject | null;
  readonly onChoose: (card: ListedProject | null) => void;
}) {
  const { environmentId, chosen } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const choose = (card: ListedProject | null) => {
    setOpen(false);
    setQuery("");
    props.onChoose(card);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Project: ${chosen === null ? "a new project" : workspaceTitle(chosen.project.name, null)}. Choose another`}
          />
        }
      >
        {chosen === null ? (
          <PlusIcon aria-hidden="true" />
        ) : (
          <ProjectThumb environmentId={environmentId} project={chosen.project} size="xs" />
        )}
        <span className="max-w-48 truncate">
          {chosen === null ? "Project" : workspaceTitle(chosen.project.name, null)}
        </span>
        <ChevronsUpDownIcon className="text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverPopup width="md" padding="compact" align="start" initialFocus={input}>
        <button
          type="button"
          className={cn(PROJECT_ROW_CLASS, "mb-1.5 w-full", chosen === null && "bg-accent")}
          onClick={() => choose(null)}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-border">
            <PlusIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          </span>
          New project
        </button>
        <ProjectChoices
          environmentId={environmentId}
          cards={props.cards}
          onChoose={choose}
          query={query}
          onQueryChange={setQuery}
          inputRef={input}
          none="No projects yet."
        />
      </PopoverPopup>
    </Popover>
  );
}
