import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { PaperclipIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { useNowMinute } from "~/hooks/useNowMinute";
import { shortcutLabelForCommand } from "~/keybindings";
import { useRightPanelStore } from "~/rightPanelStore";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { buildThreadRouteParams } from "~/threadRoutes";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { SidebarInset } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import type { ListedProject } from "./projectList";
import { ProjectTile } from "./ProjectTile";
import { ENGINEERING_COMPOSER_PLACEHOLDER } from "./studioInterface";
import { splitStarred, useStarredStore } from "./starredProjects";
import { ImportDialogHost } from "./ImportDialog";
import { SAMPLE_PROJECT } from "./homeExamples";
import { ImportDropZone } from "./ImportDropZone";
import { ImportMenu } from "./ImportMenu";
import { NewFilesNotice } from "./NewFilesNotice";
import { whenTouched } from "./ProjectChoices";
import { ProjectPicker } from "./ProjectPicker";
import { needsYou } from "./recentActivity";
import { StudioNew } from "./StudioNew";
import { StudioTopBar } from "./StudioTopBar";
import { useImportActions } from "./useImportActions";
import { useOpenProject } from "./useOpenProject";
import { useOpenShortcut } from "./useOpenShortcut";
import { useProjectList } from "./useProjectList";
import { type ProjectStart, useStartProject } from "./useStartProject";

const SECTION_LABEL = "text-2xs font-medium tracking-widest text-muted-foreground uppercase";
/** A group within Your projects, in the project switcher's words: Starred, then Recent. */
const GROUP_LABEL = "text-xs font-medium text-muted-foreground";
/** A first visit's offer: what it is beside the one button that does it. */
const OFFER =
  "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-dashed border-border px-4 py-3";
/** Project tiles, four across on a wide window, as many as fit on a narrow one. */
const TILE_GRID = "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4";

/** Opens the quick find (`StudioQuickFind`): the top bar's search, and Cmd+O on Home. */
const openFind = () => openCommandPalette();

/** The top bar's search: it opens the quick find (⌘K, `StudioQuickFind`), which finds parts too. */
function FindButton() {
  const shortcut = shortcutLabelForCommand(
    useAtomValue(primaryServerKeybindingsAtom),
    "commandPalette.toggle",
  );
  return (
    <button
      type="button"
      onClick={openFind}
      className="flex h-8 w-full max-w-72 items-center gap-2 rounded-lg border border-input bg-background px-2.5 text-sm text-muted-foreground shadow-xs/5 outline-none transition-colors duration-150 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset dark:bg-input/32"
    >
      <SearchIcon className="size-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-left">Search projects and parts</span>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </button>
  );
}

/**
 * Studio's Home, its one page, the way a CAD tool's welcome starts. Its box takes what to make:
 * Start sends it to a new project (made, with a first chat that sends it), or, with a project of
 * yours chosen beside Attach, to a new chat in that project. Below are your projects, starred
 * first, as pictures of their parts, the one opened last first, each opening where it was left.
 * New and Import beside them add a project: New the same New and dialog as a project's toolbar
 * (a part, a board or a document, in a new project), Import from files. A project with a chat
 * waiting on the person (a question, an approval) comes first, says so, and opens on that chat;
 * chats otherwise live in their project, down its left. Search finds a project, a part or a chat
 * (`StudioQuickFind`). One column, so the box and the tiles line up.
 */
export function StudioHome() {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : <StudioHomeFor environmentId={environmentId} />;
}

function StudioHomeFor(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const { list, cards } = useProjectList(environmentId);
  // Until the list arrives Home is neither a first visit nor a return, so nothing first-run shows.
  const loaded = list !== undefined;
  const firstTime = loaded && cards.length === 0;
  const startProject = useStartProject(environmentId);
  const [busy, setBusy] = useState(false);
  // One start at a time, from the box or from New: a second press while one is made does nothing.
  const start = async (work: ProjectStart) => {
    if (busy) return;
    setBusy(true);
    try {
      await startProject(work);
    } finally {
      setBusy(false);
    }
  };
  const openProject = useOpenProject();
  const importActions = useImportActions();
  useNowMinute();
  useOpenShortcut(openFind);
  const navigate = useNavigate();
  const waiting = useMemo(() => {
    const byProject = new Map<string, EnvironmentThreadShell[]>();
    for (const { card, thread } of needsYou(cards)) {
      byProject.set(card.id, [...(byProject.get(card.id) ?? []), thread]);
    }
    return byProject;
  }, [cards]);
  // Waiting on the person first, each list otherwise in its own order.
  const waitingFirst = (list: ReadonlyArray<ListedProject>) =>
    list.toSorted((a, b) => Number(waiting.has(b.id)) - Number(waiting.has(a.id)));
  const split = splitStarred(
    cards,
    useStarredStore((store) => store.starred),
  );
  const starred = waitingFirst(split.starred);
  const rest = waitingFirst(split.rest);
  const openChat = (thread: EnvironmentThreadShell) => {
    const ref = scopeThreadRef(thread.environmentId, thread.id);
    useRightPanelStore.getState().setMaximized(ref, false);
    void navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
  };
  const tile = (card: ListedProject) => {
    const { id, project, folder, threads } = card;
    const asking = waiting.get(id) ?? [];
    const first = asking[0];
    return (
      <ProjectTile
        key={id}
        environmentId={environmentId}
        id={id}
        project={project}
        threads={threads}
        waiting={asking}
        when={whenTouched(card)}
        onOpen={() => (first === undefined ? void openProject(folder, threads) : openChat(first))}
      />
    );
  };

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <StudioTopBar>
          <FindButton />
        </StudioTopBar>
        <ImportDropZone>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-6 py-8">
              <div className="flex flex-col gap-6">
                <h1 className="text-2xl font-semibold text-foreground">
                  {firstTime ? "Welcome to Studio" : "Welcome back"}
                </h1>
                <NewFilesNotice environmentId={environmentId} />
                <StartProject
                  environmentId={environmentId}
                  cards={cards}
                  firstTime={firstTime}
                  busy={busy}
                  start={start}
                />
              </div>
              {loaded ? (
                <section aria-label="Your projects" className="flex min-w-0 flex-col gap-3">
                  {/* New and Import add a project: from a part, board or document, or from files. */}
                  <div className="flex items-center gap-2">
                    <h2 className={SECTION_LABEL}>Your projects</h2>
                    <div className="flex-1" />
                    {importActions === null || firstTime ? null : (
                      <ImportMenu actions={importActions} />
                    )}
                    <StudioNew
                      environmentId={environmentId}
                      cwd=""
                      newProject
                      onCreate={(job) => start({ kind: "new", job })}
                    />
                  </div>
                  {firstTime ? (
                    importActions === null ? (
                      <p className="py-8 text-sm text-muted-foreground">
                        No projects yet. Describe one above, or use New.
                      </p>
                    ) : (
                      <div className={OFFER}>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-sm font-medium text-foreground">
                            Import what you already have
                          </span>
                          <span className="text-sm text-muted-foreground">
                            Studio scans the folders you pick for CAD models, drawings and parts
                            lists, and groups them into projects. Your files stay where they are.
                          </span>
                        </span>
                        <Button size="sm" variant="outline" onClick={importActions.scan}>
                          Scan this computer
                        </Button>
                      </div>
                    )
                  ) : (
                    <>
                      {starred.length === 0 ? null : (
                        <>
                          <h3 className={GROUP_LABEL}>Starred</h3>
                          <div className={TILE_GRID}>{starred.map(tile)}</div>
                          {rest.length === 0 ? null : <h3 className={GROUP_LABEL}>Recent</h3>}
                        </>
                      )}
                      {rest.length === 0 ? null : <div className={TILE_GRID}>{rest.map(tile)}</div>}
                    </>
                  )}
                </section>
              ) : null}
            </div>
          </div>
        </ImportDropZone>
      </div>
      <ImportDialogHost environmentId={environmentId} />
    </SidebarInset>
  );
}

/**
 * Home's box: describe what to make and Start. It goes to a new project, as it starts, or to a
 * new chat in a project of yours chosen beside Attach (`ProjectPicker`), the box then reading as a
 * project's chat box does. With no projects yet it offers the sample project.
 */
function StartProject(props: {
  readonly environmentId: EnvironmentId;
  readonly cards: ReadonlyArray<ListedProject>;
  /** No projects yet: the sample project is offered, and there is nothing to choose. */
  readonly firstTime: boolean;
  /** A start is under way (from here or from New). */
  readonly busy: boolean;
  readonly start: (work: ProjectStart) => Promise<void>;
}) {
  const { environmentId, firstTime, busy } = props;
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen = props.cards.find((card) => card.id === chosenId) ?? null;
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const describe = useRef<HTMLTextAreaElement>(null);
  const hash = useLocation({ select: (location) => location.hash });
  // A workspace's New project (`ProjectSwitcher`) lands here: the box takes the typing.
  useEffect(() => {
    if (hash === "start") describe.current?.focus();
  }, [hash]);
  const run = props.start;
  const ready = description.trim() !== "" && !busy;
  const startDescribed = () => {
    if (ready) void run({ kind: "described", description, files, project: chosen });
  };
  const placeholder = chosen === null ? "Describe a new project" : ENGINEERING_COMPOSER_PLACEHOLDER;

  return (
    <section aria-label="Start" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xs/5 focus-within:border-ring">
        <Textarea
          ref={describe}
          unstyled
          rows={3}
          aria-label={placeholder}
          placeholder={placeholder}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              startDescribed();
            }
          }}
        />
        {files.length === 0 ? null : (
          <ul aria-label="Attached" className="flex flex-wrap gap-1.5">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${file.size}-${file.lastModified}`}
                className="flex max-w-60 items-center gap-1 rounded-md border border-border bg-muted/40 py-0.5 pr-0.5 pl-2 text-xs text-foreground"
              >
                <span className="truncate">{file.name}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((current) => current.filter((_, at) => at !== index))}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              const picked = Array.from(event.target.files ?? []);
              setFiles((current) => [...current, ...picked]);
              event.target.value = "";
            }}
          />
          <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
            <PaperclipIcon />
            Attach
          </Button>
          {firstTime || props.cards.length === 0 ? null : (
            <ProjectPicker
              environmentId={environmentId}
              cards={props.cards}
              chosen={chosen}
              onChoose={(card) => setChosenId(card?.id ?? null)}
            />
          )}
          <div className="flex-1" />
          <Button size="sm" disabled={!ready} onClick={startDescribed}>
            {busy ? "Starting…" : "Start"}
          </Button>
        </div>
      </div>
      {firstTime ? (
        <div className={OFFER}>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">A sample project</span>
            <span className="text-sm text-muted-foreground">
              The agent builds a servo bracket, checks its strength, draws it and writes its PRD, so
              each part of Studio has something in it.
            </span>
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run({
                kind: "described",
                description: SAMPLE_PROJECT.description,
                files: [],
                project: null,
              })
            }
          >
            {SAMPLE_PROJECT.label}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
