import type { EnvironmentId } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { studioFolderKey } from "@t3tools/shared/studioProjects";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { CompassIcon, HomeIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import { useComposerHandleContext } from "~/composerHandleContext";
import { cn } from "~/lib/utils";
import { buildThreadRouteParams } from "~/threadRoutes";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { formatRelativeTimeLabel } from "~/timestampFormat";
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
import { chatStanding } from "./chatStanding";
import { useDocumentTemplates } from "./documentTemplates";
import { FileKindIcon } from "./FileKindIcon";
import { type HardwareActionGroup, hardwareActions } from "./hardwareActions";
import { CHAT_ICON, KIND_ICONS, KIND_TINTS, MENU_ICONS } from "./kinds";
import { handToChat } from "./NewDialog";
import { DOCUMENT_TEMPLATES, newWorkPrompt } from "./newTemplates";
import { useOpenedThreads } from "./openedThreads";
import { useOpenWorkspaceStore } from "./openWorkspace";
import { partLabel } from "./partNames";
import { ProjectThumb, whenTouched } from "./ProjectChoices";
import { classifyProjectFile, type ProjectGroup } from "./projectFiles";
import type { ListedProject } from "./projectList";
import { type FoundPart, findJobs, folderDocuments, folderParts, holdsWords } from "./quickFind";
import { homeRecent } from "./recentActivity";
import { useRecentFiles } from "./recentFiles";
import { studioInterfaceCommands } from "./studioInterface";
import { useFolderPaths } from "./useFolderPaths";
import { showChat } from "./overviewPanel";
import { openInPanel } from "./useOpenInWorkbench";
import { useOpenProject } from "./useOpenProject";
import { useTourStore } from "./tourSteps";
import { useProjectList } from "./useProjectList";
import { chatLabel } from "./workspaceTitle";

const ICON = "size-4 shrink-0 text-muted-foreground";
/** A group lists this many with nothing typed, and this many matches. */
const SHOWN_UNTYPED = 5;
const SHOWN_TYPED = 8;

/** A part's, a document's or a chat's row: its kind's icon in its kind's color (`kinds.ts`). */
function KindIcon(props: { readonly group: ProjectGroup | "Chats" }) {
  const Icon = props.group === "Chats" ? CHAT_ICON : KIND_ICONS[props.group];
  return <Icon className={cn("size-4 shrink-0", KIND_TINTS[props.group])} />;
}

/** A job's row: the icon of its menu, which is the icon of what it makes. */
function JobIcon(props: { readonly group: HardwareActionGroup }) {
  const Icon = MENU_ICONS[props.group];
  return <Icon className={ICON} />;
}

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
  const documents = useDocumentTemplates(environmentId);
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const composerRef = useComposerHandleContext();
  const openProject = useOpenProject();
  const navigate = useNavigate();
  const onHome = useLocation({ select: (location) => location.pathname === "/" });
  const opened = useOpenedThreads();
  const recentFiles = useRecentFiles();

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
  const docs = useMemo(
    () =>
      folderDocuments<ListedProject | null>(
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
  // A new document starts as New's Create starts it: written into the chat and sent.
  const startWork = (prompt: string) => {
    if (composerRef !== null) handToChat(composerRef, prompt);
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
          label: `What to do with ${partTitle}`,
          rows: findJobs(menus, query).map(({ action, place }) => ({
            value: `job:${action.id}`,
            icon: <JobIcon group={action.group} />,
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
      icon: <KindIcon group={found.file.group} />,
      title: found.file.title,
      description:
        !typed || inHere(found)
          ? found.file.kind
          : `${found.file.kind} · ${found.project?.project.name ?? ""}`,
      run: () => openPart(found),
    })),
  };
  const shownDocs = typed
    ? docs.filter(({ project, file }) =>
        holdsWords(
          `${file.title}\n${file.kind}\n${file.path}\n${project?.project.name ?? ""}`,
          query,
        ),
      )
    : docs.filter(inHere).slice(0, SHOWN_UNTYPED);
  const documentFiles: Group = {
    label: typed || current === null ? "Documents" : `Documents in ${current.project.name}`,
    rows: shownDocs.map((found) => ({
      value: `doc:${found.root}\n${found.file.path}`,
      icon: <KindIcon group="Documents" />,
      title: found.file.title,
      description:
        !typed || inHere(found)
          ? found.file.kind
          : `${found.file.kind} · ${found.project?.project.name ?? ""}`,
      run: () => openPart(found),
    })),
  };
  // Chats, as the sidebar lists a project's: the open project's newest when nothing is typed.
  const chats = (typed ? cards : current === null ? [] : [current])
    .flatMap((card) => card.threads.map((thread) => ({ card, thread })))
    .filter(
      ({ card, thread }) => !typed || holdsWords(`${thread.title}\n${card.project.name}`, query),
    )
    .toSorted((a, b) => b.thread.updatedAt.localeCompare(a.thread.updatedAt))
    .slice(0, typed ? SHOWN_TYPED : SHOWN_UNTYPED);
  const chatRows: Group = {
    label: typed || current === null ? "Chats" : `Chats in ${current.project.name}`,
    rows: chats.map(({ card, thread }) => ({
      value: `chat:${thread.id}`,
      icon: <KindIcon group="Chats" />,
      title: chatLabel(thread.title),
      description:
        card === current
          ? chatStanding(thread).text
          : `${chatStanding(thread).text} · ${card.project.name}`,
      ...(thread.id === workspace?.threadRef.threadId ? { trailing: "Open" } : {}),
      run: go(() => {
        const ref = scopeThreadRef(thread.environmentId, thread.id);
        showChat(ref);
        if (thread.id === workspace?.threadRef.threadId) return;
        void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
      }),
    })),
  };
  // What was opened lately, chats and files across every project, as Drive's Recent lists it:
  // with nothing typed and no project open, so Home's ⌘K jumps back into the work.
  const recent: Group = {
    label: "Recent",
    rows:
      typed || current !== null
        ? []
        : homeRecent(cards, opened, recentFiles, SHOWN_UNTYPED).map((item) => {
            const ref = scopeThreadRef(item.thread.environmentId, item.thread.id);
            const openChat = () => {
              showChat(ref);
              void navigate({
                to: "/$environmentId/$threadId",
                params: buildThreadRouteParams(ref),
              });
            };
            const description = `${item.card.project.name} · ${formatRelativeTimeLabel(item.at)}`;
            return item.kind === "chat"
              ? {
                  value: `recent:chat:${item.thread.id}`,
                  icon: <KindIcon group="Chats" />,
                  title: chatLabel(item.thread.title),
                  description,
                  run: go(openChat),
                }
              : {
                  value: `recent:file:${item.thread.id}\n${item.file.path}`,
                  icon: <FileKindIcon path={item.file.path} className="size-4" />,
                  title: partLabel(item.file.path.split(/[\\/]/).pop() ?? item.file.path),
                  description,
                  run: go(() => {
                    openInPanel(plugins, ref, item.file.path);
                    openChat();
                  }),
                };
          }),
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
      // A project as the switcher shows it: its picture and when it was last opened.
      .map((card) => ({
        value: `project:${card.id}`,
        icon: <ProjectThumb environmentId={environmentId} project={card.project} size="sm" />,
        title: card.project.name,
        description: whenTouched(card),
        ...(card === current ? { trailing: "Open" } : {}),
        run: go(() => {
          if (card !== current) void openProject(card.folder, card.threads);
        }),
      })),
  };
  const places: ReadonlyArray<Row & { readonly terms: string }> = [
    ...(onHome
      ? []
      : [
          {
            value: "go:home",
            icon: <HomeIcon className={ICON} />,
            title: "Home",
            terms: "home projects all start",
            run: go(() => void navigate({ to: "/" })),
          },
        ]),
    {
      value: "go:new-project",
      icon: <PlusIcon className={ICON} />,
      title: "New project",
      terms: "new project start create",
      run: go(() => void navigate({ to: "/", hash: "start" })),
    },
    // The tour shows a project's workspace: from Home it opens the last project first.
    ...(workspace === null && cards[0] === undefined
      ? []
      : [
          {
            value: "go:tour",
            icon: <CompassIcon className={ICON} />,
            title: "Take the tour",
            terms: "tour help start learn how onboarding",
            run: go(() => {
              const last = cards[0];
              if (workspace === null && last !== undefined) {
                void openProject(last.folder, last.threads);
              }
              useTourStore.getState().start();
            }),
          },
        ]),
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
  // A document from a template, written into the chat as the New dialog writes it (`NewDialog`).
  const documentRows: Group | null =
    !typed || workspace === null
      ? null
      : {
          label: "New document",
          rows: [...DOCUMENT_TEMPLATES, ...documents.templates]
            .filter((template) =>
              holdsWords(
                `${template.label}\n${template.description}\nnew document template`,
                query,
              ),
            )
            .map((template) => ({
              value: `document:${template.id}`,
              icon: <KindIcon group="Documents" />,
              title: template.label,
              description: template.description,
              run: () =>
                startWork(
                  newWorkPrompt({
                    template,
                    name: template.defaultName,
                    folder: template.folder,
                    units: "mm",
                    part: null,
                    description: "",
                    ...(template.file === undefined
                      ? {}
                      : { templateLink: serializeComposerFileLink(template.file) }),
                  }),
                ),
            })),
        };
  const goTo: Group = {
    label: "Go to",
    rows: places.filter((place) => !typed || holdsWords(`${place.title}\n${place.terms}`, query)),
  };
  const groups = (
    typed
      ? [jobs, partRows, documentFiles, chatRows, projects, documentRows, goTo]
      : [recent, partRows, documentFiles, chatRows, projects, goTo]
  ).filter((group): group is Group => group !== null && group.rows.length > 0);

  return (
    <CommandPaletteContent
      mode="none"
      value={query}
      onValueChange={setQuery}
      aria-label="Find a project, a part, a document or a chat, or what to do with a part"
      inputProps={{
        placeholder:
          partTitle === null
            ? "Find a project, a part, a document or a chat"
            : `Find anything, or what to do with ${partTitle}`,
      }}
      footerActionLabel="Choose"
      footerTrailing={
        typed || partTitle === null ? null : (
          <span className="text-xs">Type what to do, like buckling or G-code</span>
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
 * out as well (`quickFind.ts`), with Home, New project, Settings and the other interfaces. Outside a
 * project it opens on what was opened lately (Recent). A menu's
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
