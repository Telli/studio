import type { EnvironmentId } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { useNavigate } from "@tanstack/react-router";
import {
  BoxIcon,
  CircuitBoardIcon,
  FileOutputIcon,
  HomeIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { useComposerHandleContext } from "~/composerHandleContext";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { CommandPaletteContent } from "../CommandPaletteContent";
import {
  CommandDialogPopup,
  CommandGroup,
  CommandGroupLabel,
  CommandItem,
  CommandList,
} from "../ui/command";
import { hardwareActions } from "./hardwareActions";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { classifyProjectFile } from "./projectFiles";
import type { ListedProject } from "./projectList";
import { type FoundPart, findJobs, folderParts, holdsWords } from "./quickFind";
import { studioInterfaceCommands } from "./studioInterface";
import { useFolderPaths } from "./useFolderPaths";
import { openInPanel } from "./useOpenInWorkbench";
import { useOpenProject } from "./useOpenProject";
import { useProjectList } from "./useProjectList";

const ICON = "size-4 shrink-0 text-muted-foreground";

interface Row {
  readonly value: string;
  readonly icon: ReactNode;
  readonly title: string;
  readonly description?: string;
  /** Said at the row's end: "Open" on the project on screen. */
  readonly trailing?: string;
  readonly run: () => void;
}

interface Group {
  readonly label: string;
  readonly rows: ReadonlyArray<Row>;
}

function QuickFindBody(props: {
  readonly environmentId: EnvironmentId;
  readonly initialQuery: string;
  readonly close: () => void;
}) {
  const { environmentId, close } = props;
  const [query, setQuery] = useState(props.initialQuery);
  const typed = query.trim() !== "";
  const workspace = useOpenWorkspaceStore((store) => store.workspace);
  const { cards } = useProjectList(environmentId);
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const composerRef = useComposerHandleContext();
  const openProject = useOpenProject();
  const navigate = useNavigate();

  const here = workspace === null ? null : studioFolderKey(workspace.folder);
  const current =
    here === null
      ? null
      : (cards.find((card) =>
          card.project.folders.some((folder) => studioFolderKey(folder) === here),
        ) ?? null);

  // Every project's parts, the open project's first; a folder in no project has its own.
  const owners = useMemo(() => {
    const ordered =
      current === null ? cards : [current, ...cards.filter((card) => card !== current)];
    const entries = ordered.flatMap((card) =>
      card.project.folders.map((root) => [root, card] as const),
    );
    return workspace !== null && current === null
      ? [[workspace.folder, null] as const, ...entries]
      : entries;
  }, [cards, current, workspace]);
  const listings = useFolderPaths(
    environmentId,
    useMemo(() => owners.map(([root]) => root), [owners]),
  );
  const parts = useMemo(
    () =>
      folderParts<ListedProject | null>(
        listings.map((listing, index) => ({
          project: owners[index]?.[1] ?? null,
          root: listing.root,
          paths: listing.paths,
        })),
      ),
    [listings, owners],
  );
  const inHere = (part: FoundPart<ListedProject | null>) =>
    here !== null &&
    (part.project === null ? studioFolderKey(part.root) === here : part.project === current);

  const skills = useMemo(
    () => new Set((plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : []))),
    [plugins],
  );
  const part = workspace?.part ?? null;
  const process = workspace?.process;
  const menus = useMemo(
    () => (part === null ? [] : hardwareActions(part.kind, skills, process)),
    [part, skills, process],
  );
  const partTitle = part === null ? null : (classifyProjectFile(part.path)?.title ?? part.path);

  const writeJob = (prompt: string) => {
    const composer = composerRef?.current ?? null;
    if (composer !== null) {
      composer.insertTextAtEnd(prompt, { ensureLeadingBoundary: true });
      composer.focusAtEnd();
    }
    close();
  };
  const openPart = (found: FoundPart<ListedProject | null>) => {
    close();
    const full = `${found.root}/${found.file.path}`;
    if (workspace !== null && inHere(found)) {
      const path = studioFolderKey(found.root) === here ? found.file.path : full;
      openInPanel(plugins, workspace.threadRef, path);
    } else if (found.project !== null) {
      void openProject(found.project.folder, found.project.threads, (ref) =>
        openInPanel(plugins, ref, full),
      );
    }
  };
  const go = (then: () => void) => () => {
    close();
    then();
  };

  const jobs: Group | null =
    part === null || partTitle === null
      ? null
      : {
          label: `Jobs for ${partTitle}`,
          rows: findJobs(menus, query).map(({ action, place }) => ({
            value: `job:${action.id}`,
            icon: action.checks ? (
              <ListChecksIcon className={ICON} />
            ) : (
              <FileOutputIcon className={ICON} />
            ),
            title: action.label,
            description: place,
            run: () => writeJob(action.prompt(serializeComposerFileLink(part.path))),
          })),
        };
  const shownParts = typed
    ? parts.filter(({ project, file }) =>
        holdsWords(
          `${file.title}\n${file.kind}\n${file.path}\n${project?.project.name ?? ""}`,
          query,
        ),
      )
    : parts.filter(inHere);
  const partRows: Group = {
    label: typed || current === null ? "Parts" : `Parts in ${current.project.name}`,
    rows: shownParts.map((found) => ({
      value: `part:${found.root}\n${found.file.path}`,
      icon:
        found.file.kind === "Board" ? (
          <CircuitBoardIcon className={ICON} />
        ) : (
          <BoxIcon className={ICON} />
        ),
      title: found.file.title,
      description:
        !typed || inHere(found)
          ? found.file.kind
          : `${found.file.kind} · ${found.project?.project.name ?? ""}`,
      run: () => openPart(found),
    })),
  };
  const projects: Group = {
    label: "Projects",
    rows: cards
      .filter(
        (card) =>
          !typed ||
          holdsWords(
            [
              card.project.name,
              card.project.brief.purpose,
              ...card.threads.map((t) => t.title),
            ].join("\n"),
            query,
          ),
      )
      .map((card) => ({
        value: `project:${card.id}`,
        icon: <LayoutDashboardIcon className={ICON} />,
        title: card.project.name,
        ...(card === current ? { trailing: "Open" } : {}),
        run: go(() => {
          if (card !== current) void openProject(card.folder, card.threads);
        }),
      })),
  };
  const places: ReadonlyArray<Row & { readonly terms: string }> = [
    {
      value: "go:home",
      icon: <HomeIcon className={ICON} />,
      title: "Home",
      terms: "home projects start",
      run: go(() => void navigate({ to: "/" })),
    },
    {
      value: "go:new-project",
      icon: <PlusIcon className={ICON} />,
      title: "New project",
      terms: "new project start create",
      run: go(() => void navigate({ to: "/", hash: "start" })),
    },
    {
      value: "go:settings",
      icon: <SettingsIcon className={ICON} />,
      title: "Settings",
      terms: "settings preferences ai agents appearance",
      run: go(() => void navigate({ to: "/settings" })),
    },
    ...studioInterfaceCommands().map((command) => ({
      value: `go:interface:${command.id}`,
      icon: <SettingsIcon className={ICON} />,
      title: command.title,
      terms: command.searchTerms.join(" "),
      run: go(command.run),
    })),
  ];
  const goTo: Group = {
    label: "Go to",
    rows: places.filter((place) => !typed || holdsWords(`${place.title}\n${place.terms}`, query)),
  };
  const groups = (typed ? [jobs, partRows, projects, goTo] : [partRows, projects, goTo]).filter(
    (group): group is Group => group !== null && group.rows.length > 0,
  );

  return (
    <CommandPaletteContent
      mode="none"
      value={query}
      onValueChange={setQuery}
      aria-label="Find a project, a part or a job"
      inputProps={{
        placeholder:
          partTitle === null
            ? "Find a project or a part"
            : `Find a project, a part, or a job for ${partTitle}`,
      }}
      footerActionLabel="Choose"
      footerTrailing={
        typed || partTitle === null ? null : (
          <span className="text-xs">Type any job, like buckling or G-code</span>
        )
      }
    >
      {groups.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">Nothing matches that.</p>
      ) : (
        <CommandList>
          {groups.map((group) => (
            <CommandGroup key={group.label}>
              <CommandGroupLabel>{group.label}</CommandGroupLabel>
              {group.rows.map((row) => (
                <CommandItem
                  key={row.value}
                  value={row.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={row.run}
                >
                  {row.icon}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-foreground">{row.title}</span>
                    {row.description ? (
                      <span className="truncate text-xs text-muted-foreground/70">
                        {row.description}
                      </span>
                    ) : null}
                  </span>
                  {row.trailing ? (
                    <span className="shrink-0 text-xs text-muted-foreground">{row.trailing}</span>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      )}
    </CommandPaletteContent>
  );
}

/**
 * ⌘K in the engineering interface, in place of T3 Code's command palette: one box that finds a
 * project, a part in any project, or any job for the part on screen, the long tail the menus leave
 * out as well (`quickFind.ts`), with Home, New project, Settings and the other interfaces. A menu's
 * "More" opens it on that menu's jobs. Picking a job writes it into the chat's composer, as the
 * menus do; picking a part opens it, in its project if that is another.
 */
export function StudioQuickFind(props: {
  /** What it opens with typed: a menu's name from its "More" (`PartActions`), else nothing. */
  readonly query: string;
  readonly setOpen: (open: boolean) => void;
}) {
  const composerRef = useComposerHandleContext();
  const environmentId = usePrimaryEnvironmentId();
  return (
    <CommandDialogPopup
      aria-label="Find"
      className="overflow-hidden"
      data-command-palette="true"
      data-testid="command-palette"
      finalFocus={() => {
        composerRef?.current?.focusAtEnd();
        return false;
      }}
      onBackdropPointerDown={() => props.setOpen(false)}
    >
      {environmentId === null ? null : (
        <QuickFindBody
          environmentId={environmentId}
          initialQuery={props.query}
          close={() => props.setOpen(false)}
        />
      )}
    </CommandDialogPopup>
  );
}
