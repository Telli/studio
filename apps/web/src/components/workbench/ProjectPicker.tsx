import type { EnvironmentId } from "@t3tools/contracts";
import { ChevronsUpDownIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";

import { cn } from "~/lib/utils";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import {
  PROJECT_CONTROL_CLASS,
  PROJECT_ROW_CLASS,
  ProjectChoices,
  ProjectThumb,
} from "./ProjectChoices";
import type { ListedProject } from "./projectList";

/**
 * Where Home's box sends what is typed: a new project, as it starts, or a chat in a project of
 * yours, chosen the way the project switcher chooses one (`ProjectChoices`): the same control,
 * pictures and list, with New project at its head.
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
          <button
            type="button"
            aria-label={`Project: ${chosen === null ? "a new project" : chosen.project.name}. Choose another`}
            className={cn(PROJECT_CONTROL_CLASS, "h-9")}
          />
        }
      >
        {chosen === null ? (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-dashed border-border">
            <PlusIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          </span>
        ) : (
          <ProjectThumb environmentId={environmentId} project={chosen.project} size="sm" />
        )}
        <span className="flex min-w-0 flex-col">
          <span className="text-3xs leading-3 font-medium tracking-wider text-muted-foreground uppercase">
            Project
          </span>
          <span className="max-w-48 truncate text-sm leading-4 font-semibold text-foreground">
            {chosen === null ? "New project" : chosen.project.name}
          </span>
        </span>
        <ChevronsUpDownIcon
          className="ms-0.5 size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
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
