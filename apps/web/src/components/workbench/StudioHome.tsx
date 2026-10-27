import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { FolderInputIcon, PaperclipIcon, SearchIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { shortcutLabelForCommand } from "~/keybindings";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Kbd } from "../ui/kbd";
import { SidebarInset } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import type { ListedProject } from "./projectList";
import { ENGINEERING_COMPOSER_PLACEHOLDER } from "./studioInterface";
import { splitStarred, useStarredStore } from "./starredProjects";
import { ImportDialogHost } from "./ImportDialog";
import { SAMPLE_PROJECT } from "./homeExamples";
import { ImportDropZone } from "./ImportDropZone";
import { ImportMenu } from "./ImportMenu";
import { NewFilesNotice } from "./NewFilesNotice";
import { HeadingLink } from "./OverviewModules";
import { waitingFirst } from "./ProjectChoices";
import { ProjectPicker } from "./ProjectPicker";
import { nameOfPath, type StartAttachment } from "./startProject";
import { droppedPath, readStudioImport } from "./studioImportBridge";
import { StudioNew } from "./StudioNew";
import { StudioTopBar } from "./StudioTopBar";
import { useImportActions } from "./useImportActions";
import { useOpenShortcut } from "./useOpenShortcut";
import { useProjectList } from "./useProjectList";
import { useProjectTiles } from "./useProjectTiles";
import { type ProjectStart, useStartOnce } from "./useStartProject";
import { useAskAnything } from "./freeformChat";
import { SAMPLE_ID } from "./library/sampleProject";
import { useExample } from "./library/useSampleProject";

const SECTION_LABEL = "text-2xs font-medium tracking-widest text-muted-foreground uppercase";
/** A group within Your projects, in the project switcher's words: Starred, then Recent. */
const GROUP_LABEL = "text-xs font-medium text-muted-foreground";
/** A first visit's offer: what it is beside the one button that does it. */
const OFFER =
  "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-dashed border-border px-4 py-3";
/** How many of the projects not starred Home shows, the last worked on: one row on a wide window. */
const HOME_RECENT = 4;
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
      <span className="min-w-0 flex-1 truncate text-left">Find anything</span>
      {shortcut ? <Kbd>{shortcut}</Kbd> : null}
    </button>
  );
}

/**
 * Studio's Home, the way a CAD tool's welcome starts: what to make, and where you left off. Its
 * box takes what to make: Start sends it to a new project (made, with a first chat that sends it),
 * or, with a project of yours chosen beside Attach, to a new chat in that project. Below are your
 * starred projects and the last few you worked on (`HOME_RECENT`), as pictures of their parts,
 * each opening where it was left; All projects goes to the Projects page, which has every one
 * (`ProjectsHome`). New and Import beside them add a project: New the same New and dialog as a
 * project's toolbar (a part, a board or a document, in a new project), Import from files. A project
 * with a chat waiting on the person (a question, an approval) comes first, says so, and opens on
 * that chat. Search finds a project, a part or a chat (`StudioQuickFind`). One column, so the box
 * and the tiles line up.
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
  // One start at a time, from the box or from New.
  const { busy, start } = useStartOnce(environmentId);
  const importActions = useImportActions();
  const navigate = useNavigate();
  useNowMinute();
  useOpenShortcut(openFind);
  const { tile, dialogs } = useProjectTiles(environmentId, cards);
  const split = splitStarred(
    cards,
    useStarredStore((store) => store.starred),
  );
  const starred = waitingFirst(split.starred);
  // The last few, the ones waiting on the person first; every project is on the Projects page.
  const recent = waitingFirst(split.rest).slice(0, HOME_RECENT);
  const allProjects = (
    <HeadingLink label="All projects" onClick={() => void navigate({ to: "/projects" })} />
  );

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
                        <TileGroup
                          label="Starred"
                          action={recent.length === 0 ? allProjects : null}
                        >
                          {starred.map(tile)}
                        </TileGroup>
                      )}
                      {recent.length === 0 ? null : (
                        <TileGroup label="Recent" action={allProjects}>
                          {recent.map(tile)}
                        </TileGroup>
                      )}
                    </>
                  )}
                </section>
              ) : null}
            </div>
          </div>
        </ImportDropZone>
      </div>
      <ImportDialogHost environmentId={environmentId} />
      {dialogs}
    </SidebarInset>
  );
}

/** A group of Home's tiles under its label (Starred, Recent), with what its heading offers. */
function TileGroup(props: {
  readonly label: string;
  readonly action: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3 className={GROUP_LABEL}>{props.label}</h3>
        <div className="flex-1" />
        {props.action}
      </div>
      <div className={TILE_GRID}>{props.children}</div>
    </div>
  );
}

/** A file attached to Home's box: by its path on this computer, where the desktop app gives one. */
function fromFile(file: File): StartAttachment {
  const path = droppedPath(file);
  return path === null
    ? { name: file.name, path: null, file }
    : { name: nameOfPath(path), path, file: null };
}

const fromPath = (path: string): StartAttachment => ({ name: nameOfPath(path), path, file: null });

/** How Home's box starts a project: from an idea in words, or from files you already have. */
type StartMode = "idea" | "ask" | "files";

/** What Set up from files does, in order. */
const SET_UP_STEPS = [
  "Add what you have",
  "Studio reads it and fills in the Overview",
  "You answer what's left",
] as const;

/** The files and folders attached to Home's box, each with its Remove. */
function AttachedList(props: {
  readonly attachments: ReadonlyArray<StartAttachment>;
  readonly onRemove: (index: number) => void;
}) {
  if (props.attachments.length === 0) return null;
  return (
    <ul aria-label="Attached" className="flex flex-wrap gap-1.5">
      {props.attachments.map((attachment, index) => (
        <li
          key={
            attachment.path ??
            `${attachment.name}-${attachment.file?.size}-${attachment.file?.lastModified}`
          }
          className="flex max-w-60 items-center gap-1 rounded-md border border-border bg-muted/40 py-0.5 pr-0.5 pl-2 text-xs text-foreground"
        >
          <span className="truncate">{attachment.name}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${attachment.name}`}
            onClick={() => props.onRemove(index)}
          >
            <XIcon />
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Home's box, in three modes, each named with its button's word, as a sign-in form's Sign in and
 * Sign up. Ask: a question about anything, in a
 * chat in no project (`freeformChat.ts`), where the agent finds the work it is about. Start, from
 * an idea: say what to make and Start. It goes to a new project, as it starts, or to a new chat in a project of yours chosen
 * beside Attach (`ProjectPicker`), the box then reading as a project's chat box does. Set up, from
 * files: drop or choose what you already have (a PRD, requirements, sketches, CAD, a whole
 * folder), say what it is if you like, and Set up project makes a new project from it. Either way, files go into the project's References and
 * the agent reads them first (`startMessage`). With no projects yet it offers the sample project.
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
  const [mode, setMode] = useState<StartMode>("idea");
  const settingUp = mode === "files";
  const [chosenId, setChosenId] = useState<string | null>(null);
  const chosen = props.cards.find((card) => card.id === chosenId) ?? null;
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState<StartAttachment[]>([]);
  // A file dropped on the box is attached, as the chat's box attaches it (Home elsewhere imports).
  const [attaching, setAttaching] = useState(false);
  // The desktop app: files and folders, by their paths, copied into the project on Start.
  const bridge = readStudioImport();
  const attach = (added: ReadonlyArray<StartAttachment>) =>
    setAttachments((current) => [
      ...current,
      ...added.filter(
        (item) => item.path === null || !current.some((held) => held.path === item.path),
      ),
    ]);
  const fileInput = useRef<HTMLInputElement>(null);
  // The desktop app's picker takes folders too; the browser's takes files.
  const choose = () => {
    if (bridge === null) fileInput.current?.click();
    else void bridge.pick().then((paths) => attach(paths.map(fromPath)));
  };
  const describe = useRef<HTMLTextAreaElement>(null);
  const hash = useLocation({ select: (location) => location.hash });
  // A workspace's New project (`ProjectSwitcher`) lands here: the box takes the typing.
  useEffect(() => {
    if (hash === "start") describe.current?.focus();
  }, [hash]);
  const run = props.start;
  const asking = mode === "ask";
  const askAnything = useAskAnything(environmentId);
  const [askBusy, setAskBusy] = useState(false);
  // Setting up needs something to set up from; describing and asking, words or files.
  const ready =
    (settingUp ? attachments.length > 0 : description.trim() !== "" || attachments.length > 0) &&
    !busy &&
    !askBusy;
  const startNow = () => {
    if (!ready) return;
    if (asking) {
      setAskBusy(true);
      void askAnything({
        question: description,
        paths: attachments.flatMap((attachment) => attachment.path ?? []),
        files: attachments.flatMap((attachment) =>
          attachment.path === null && attachment.file !== null ? [attachment.file] : [],
        ),
      }).finally(() => setAskBusy(false));
      return;
    }
    void run({
      kind: "described",
      description,
      attachments,
      project: settingUp ? null : chosen,
    });
  };
  const startOnShortcut = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      startNow();
    }
  };
  const placeholder = asking
    ? "Ask about anything: a part you made, a file, how something was done"
    : chosen === null
      ? "Describe a new project"
      : ENGINEERING_COMPOSER_PLACEHOLDER;

  return (
    <section aria-label="Start" className="flex min-w-0 flex-col gap-3">
      <div
        data-attach-drop=""
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setAttaching(true);
        }}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          setAttaching(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setAttaching(false);
          attach(Array.from(event.dataTransfer.files).map(fromFile));
        }}
        className={cn(
          "relative flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xs/5 focus-within:border-ring",
          attaching && "border-ring",
        )}
      >
        {attaching ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 text-sm font-medium text-foreground">
            {settingUp
              ? "Drop to add them"
              : bridge === null
                ? "Drop files to attach"
                : "Drop files or folders to attach"}
          </div>
        ) : null}
        <ToggleGroup
          aria-label="How to start"
          value={[mode]}
          onValueChange={(next) => {
            const value = next[0];
            if (value === "idea" || value === "ask" || value === "files") setMode(value);
          }}
        >
          <Toggle value="idea">Start</Toggle>
          <Toggle value="ask">Ask</Toggle>
          <Toggle value="files">Set up</Toggle>
        </ToggleGroup>
        {settingUp ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            <FolderInputIcon className="size-5" aria-hidden="true" />
            <span>
              Drop your PRD, requirements, sketches, CAD
              {bridge === null ? "" : " or a whole folder"}
            </span>
            <Button variant="outline" size="sm" onClick={choose}>
              {bridge === null ? "Choose files" : "Choose files or folders"}
            </Button>
          </div>
        ) : (
          <Textarea
            ref={describe}
            unstyled
            rows={3}
            aria-label={placeholder}
            placeholder={placeholder}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={startOnShortcut}
          />
        )}
        <AttachedList
          attachments={attachments}
          onRemove={(index) => setAttachments((current) => current.filter((_, at) => at !== index))}
        />
        {settingUp ? (
          <Input
            size="sm"
            aria-label="What it is"
            placeholder="What it is (optional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onKeyDown={startOnShortcut}
          />
        ) : asking ? null : attachments.some((attachment) => attachment.path !== null) ? (
          <p className="text-xs text-muted-foreground">
            These go in {chosen === null ? "the new project's" : `${chosen.project.name}'s`}{" "}
            References, and the agent reads them first.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              attach(Array.from(event.target.files ?? []).map(fromFile));
              event.target.value = "";
            }}
          />
          {settingUp ? (
            <ol
              aria-label="Setting up"
              className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
            >
              {SET_UP_STEPS.map((step, index) => (
                <li key={step} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border text-2xs text-foreground"
                  >
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={choose}>
                <PaperclipIcon />
                Attach
              </Button>
              {asking || firstTime || props.cards.length === 0 ? null : (
                <ProjectPicker
                  environmentId={environmentId}
                  cards={props.cards}
                  chosen={chosen}
                  onChoose={(card) => setChosenId(card?.id ?? null)}
                />
              )}
            </>
          )}
          <div className="flex-1" />
          <Button size="sm" disabled={!ready} onClick={startNow}>
            {settingUp
              ? busy
                ? "Setting up…"
                : "Set up project"
              : asking
                ? askBusy
                  ? "Asking…"
                  : "Ask"
                : busy
                  ? "Starting…"
                  : "Start"}
          </Button>
        </div>
      </div>
      {firstTime ? <SampleOffer environmentId={environmentId} busy={busy} start={run} /> : null}
    </section>
  );
}

/**
 * A first visit's sample project: where the desktop app can copy it, the finished one Studio
 * ships, copied into a project of your own (`useExample`); elsewhere the prompt in which the
 * agent builds it.
 */
function SampleOffer(props: {
  readonly environmentId: EnvironmentId;
  /** A start is under way (from Home's box or from New). */
  readonly busy: boolean;
  readonly start: (work: ProjectStart) => Promise<void>;
}) {
  const example = useExample(props.environmentId, SAMPLE_ID);
  const sample = example?.canCopy === true ? example : null;
  const [opening, setOpening] = useState(false);
  const open = () => {
    if (sample === null) {
      void props.start({
        kind: "described",
        description: SAMPLE_PROJECT.description,
        attachments: [],
        project: null,
      });
      return;
    }
    setOpening(true);
    void sample.copy().finally(() => setOpening(false));
  };
  return (
    <div className={OFFER}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">A sample project</span>
        <span className="text-sm text-muted-foreground">
          {sample === null
            ? "The agent builds a servo bracket, checks its strength, draws it and writes its PRD, so each part of Studio has something in it."
            : "A finished servo bracket project: the part, its drawing, its strength study, its PRD, and an example of almost everything else Studio makes."}
        </span>
      </span>
      <Button size="sm" variant="outline" disabled={props.busy || opening} onClick={open}>
        {SAMPLE_PROJECT.label}
      </Button>
    </div>
  );
}
