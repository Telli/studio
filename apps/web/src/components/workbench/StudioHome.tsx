import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { PaperclipIcon, SearchIcon, XIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { useNowMinute } from "~/hooks/useNowMinute";
import { cn } from "~/lib/utils";
import { shortcutLabelForCommand } from "~/keybindings";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { SidebarInset } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import type { ListedProject } from "./projectList";
import { ENGINEERING_COMPOSER_PLACEHOLDER } from "./studioInterface";
import { splitStarred, useStarredStore } from "./starredProjects";
import { ImportDialogHost } from "./ImportDialog";
import { homeLayout } from "./homeStart";
import { ImportDropZone } from "./ImportDropZone";
import { ImportMenu } from "./ImportMenu";
import { NewFilesNotice } from "./NewFilesNotice";
import { HeadingLink } from "./OverviewModules";
import { waitingFirst } from "./ProjectChoices";
import { ProjectPicker } from "./ProjectPicker";
import { GetStarted, StartChoices, StartExamples, TILE_GRID } from "./StartChoices";
import { canStart, nameOfPath, type StartAttachment } from "./startProject";
import { droppedPath, readStudioImport } from "./studioImportBridge";
import { StudioNew } from "./StudioNew";
import { StudioTopBar } from "./StudioTopBar";
import { useImportActions } from "./useImportActions";
import { useNewPart } from "./useNewPart";
import { useOpenShortcut } from "./useOpenShortcut";
import { useProjectList } from "./useProjectList";
import { useProjectTiles } from "./useProjectTiles";
import { type ProjectStart, useStartOnce } from "./useStartProject";
import { useExamples } from "./library/useSampleProject";

const SECTION_LABEL = "text-2xs font-medium tracking-widest text-muted-foreground uppercase";
/** A group within Your projects, in the project switcher's words: Starred, then Recent. */
const GROUP_LABEL = "text-xs font-medium text-muted-foreground";
/** How many of the projects not starred Home shows, the last worked on: one row on a wide window. */
const HOME_RECENT = 4;

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
 * Studio's Home, the way a CAD tool's welcome starts: what to make, and where you left off. With no
 * projects (`homeLayout`) it asks Where would you like to start?, with two big buttons (New part,
 * Import a STEP; `StartChoices`), Home's Start box right under them, and the examples
 * Studio ships to make a copy of. With projects it is Welcome back: the box, then your starred
 * projects and the last few you worked on (`HOME_RECENT`), as pictures of their parts, each opening
 * where it was left, and the examples in a Get started strip under them that folds away. All
 * projects goes to the Projects page, which has every one (`ProjectsHome`). The box takes what to
 * make: Start sends it to a new project (made, with a first chat that sends it), or, with a project
 * of yours chosen beside Attach, to a new chat in that project. New and Import beside the tiles add
 * a project: New the same New and dialog as a project's toolbar (a part, a board or a document, in
 * a new project), Import from files. A project with a chat waiting on the person (a question, an
 * approval) comes first, says so, and opens on that chat. Search finds a project, a part or a chat
 * (`StudioQuickFind`). One column, so the box and the tiles line up.
 */
export function StudioHome() {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : <StudioHomeFor environmentId={environmentId} />;
}

function StudioHomeFor(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const { list, cards } = useProjectList(environmentId);
  // Until the list arrives nothing shows under the box, and the start page waits (`homeLayout`).
  const loaded = list !== undefined;
  const layout = homeLayout({ loaded, projects: cards.length });
  const { examples } = useExamples(environmentId);
  // One start at a time, from the box or from New.
  const { busy, start } = useStartOnce(environmentId);
  const importActions = useImportActions();
  const navigate = useNavigate();
  useNowMinute();
  useOpenShortcut(openFind);
  const { tile, dialogs } = useProjectTiles(environmentId, cards);
  const newPart = useNewPart(environmentId);
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
  // Home's New: Create starts a new project with the job as its first message, and its Part is
  // New part. On the start page it has no button, and opens when asked (New project from ⌘K).
  const newProject = (hideButton: boolean) => (
    <StudioNew
      environmentId={environmentId}
      cwd=""
      newProject
      hideButton={hideButton}
      onCreate={(job) => start({ kind: "new", job })}
      onNewPart={newPart.create}
    />
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
                  {layout === "start" ? "Where would you like to start?" : "Welcome back"}
                </h1>
                <NewFilesNotice environmentId={environmentId} />
                {layout === "start" ? (
                  <StartChoices
                    onNewPart={() => void newPart.create()}
                    newPartBusy={newPart.busy}
                    importActions={importActions}
                  />
                ) : null}
                <StartProject
                  environmentId={environmentId}
                  cards={cards}
                  busy={busy}
                  start={start}
                />
              </div>
              {!loaded ? null : layout === "start" ? (
                <>
                  <StartExamples examples={examples} />
                  {newProject(true)}
                </>
              ) : (
                <>
                  <section aria-label="Your projects" className="flex min-w-0 flex-col gap-3">
                    {/* New and Import add a project: from a part, board or document, or from files. */}
                    <div className="flex items-center gap-2">
                      <h2 className={SECTION_LABEL}>Your projects</h2>
                      <div className="flex-1" />
                      {importActions === null ? null : <ImportMenu actions={importActions} />}
                      {newProject(false)}
                    </div>
                    {starred.length === 0 ? null : (
                      <TileGroup label="Starred" action={recent.length === 0 ? allProjects : null}>
                        {starred.map(tile)}
                      </TileGroup>
                    )}
                    {recent.length === 0 ? null : (
                      <TileGroup label="Recent" action={allProjects}>
                        {recent.map(tile)}
                      </TileGroup>
                    )}
                  </section>
                  <GetStarted examples={examples} />
                </>
              )}
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
 * Home's Start box, the AI's way in: say what to make and Start. It goes to a new project, as it
 * starts, or to a new chat in a project of yours chosen beside Attach (`ProjectPicker`), the box
 * then reading as a project's chat box does. Files can come with the words or on their own (a PRD,
 * requirements, sketches, CAD, a whole folder: Attach, or dropped on the box), and Start makes a
 * new project from them. Files go into the project's References and the agent reads them first
 * (`startMessage`). There is no Ask here: a question goes in the box, or in a chat.
 */
function StartProject(props: {
  readonly environmentId: EnvironmentId;
  readonly cards: ReadonlyArray<ListedProject>;
  /** A start is under way (from here or from New). */
  readonly busy: boolean;
  readonly start: (work: ProjectStart) => Promise<void>;
}) {
  const { environmentId, busy } = props;
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
  const run = props.start;
  // Words or files make a start.
  const ready = canStart(description, attachments, busy);
  const startNow = () => {
    if (!ready) return;
    void run({
      kind: "described",
      description,
      attachments,
      project: chosen,
    });
  };
  const startOnShortcut = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      startNow();
    }
  };
  const placeholder = chosen === null ? "Describe a new project" : ENGINEERING_COMPOSER_PLACEHOLDER;

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
            {bridge === null ? "Drop files to attach" : "Drop files or folders to attach"}
          </div>
        ) : null}
        <Textarea
          unstyled
          rows={3}
          aria-label={placeholder}
          placeholder={placeholder}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          onKeyDown={startOnShortcut}
        />
        <AttachedList
          attachments={attachments}
          onRemove={(index) => setAttachments((current) => current.filter((_, at) => at !== index))}
        />
        {attachments.some((attachment) => attachment.path !== null) ? (
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
          <Button variant="ghost" size="sm" onClick={choose}>
            <PaperclipIcon />
            Attach
          </Button>
          {props.cards.length === 0 ? null : (
            <ProjectPicker
              environmentId={environmentId}
              cards={props.cards}
              chosen={chosen}
              onChoose={(card) => setChosenId(card?.id ?? null)}
            />
          )}
          <div className="flex-1" />
          <Button size="sm" disabled={!ready} onClick={startNow}>
            {busy ? "Starting…" : "Start"}
          </Button>
        </div>
      </div>
    </section>
  );
}
