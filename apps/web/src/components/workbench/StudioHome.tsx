import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import { useLocation } from "@tanstack/react-router";
import { PaperclipIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { openCommandPalette } from "~/commandPaletteBus";
import { useNowMinute } from "~/hooks/useNowMinute";
import { shortcutLabelForCommand } from "~/keybindings";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { primaryServerKeybindingsAtom } from "~/state/server";
import { Button } from "../ui/button";
import { Kbd } from "../ui/kbd";
import { SidebarInset } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { availableTemplates } from "./newTemplates";
import type { ListedProject } from "./projectList";
import { ProjectTile } from "./ProjectTile";
import { splitStarred, useStarredStore } from "./starredProjects";
import { ImportDialogHost } from "./ImportDialog";
import { HomeActivity } from "./HomeActivity";
import { ImportDropZone } from "./ImportDropZone";
import { ImportMenu } from "./ImportMenu";
import { NewFilesNotice } from "./NewFilesNotice";
import { StudioTopBar } from "./StudioTopBar";
import { useImportActions } from "./useImportActions";
import { useOpenProject } from "./useOpenProject";
import { useOpenShortcut } from "./useOpenShortcut";
import { useProjectList } from "./useProjectList";
import { type ProjectStart, useStartProject } from "./useStartProject";

const SECTION_LABEL = "text-2xs font-medium tracking-widest text-muted-foreground uppercase";

/** Blank work Home offers to model by hand, in this order, each while its skill is on. */
const BLANK_WORK = ["part", "assembly", "board"] as const;

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
 * Studio's Home, its one page, the way a CAD tool's welcome starts: describe a new project and
 * Start makes it and its first chat, or start a blank part to model by hand; below, the starred
 * projects, then every other one, as pictures, the one opened last first, with Import. Search finds a project or a part
 * (`StudioQuickFind`). Opening a project goes back to where it was left; inside one, its name
 * switches to another (`ProjectSwitcher`).
 */
export function StudioHome() {
  const environmentId = usePrimaryEnvironmentId();
  return environmentId === null ? null : <StudioHomeFor environmentId={environmentId} />;
}

function StudioHomeFor(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const { cards } = useProjectList(environmentId);
  const openProject = useOpenProject();
  const importActions = useImportActions();
  useNowMinute();
  useOpenShortcut(openFind);
  const { starred, rest } = splitStarred(
    cards,
    useStarredStore((store) => store.starred),
  );
  const tile = ({ id, project, folder, threads }: ListedProject) => (
    <ProjectTile
      key={id}
      environmentId={environmentId}
      id={id}
      project={project}
      threads={threads}
      onOpen={() => void openProject(folder, threads)}
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
            <div className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
              <div className="flex max-w-3xl flex-col gap-6">
                <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
                <NewFilesNotice environmentId={environmentId} />
                <StartProject environmentId={environmentId} />
              </div>
              <HomeActivity environmentId={environmentId} cards={cards} />
              {starred.length === 0 ? null : (
                <section aria-label="Starred" className="flex min-w-0 flex-col gap-3">
                  <h2 className={SECTION_LABEL}>Starred</h2>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                    {starred.map(tile)}
                  </div>
                </section>
              )}
              <section aria-label="Your projects" className="flex min-w-0 flex-col gap-3">
                <div className="flex items-center gap-3">
                  <h2 className={SECTION_LABEL}>Your projects</h2>
                  <div className="flex-1" />
                  {importActions === null || cards.length === 0 ? null : (
                    <ImportMenu actions={importActions} />
                  )}
                </div>
                {cards.length === 0 && importActions !== null ? (
                  <div className="flex max-w-3xl flex-col items-start gap-2 rounded-xl border border-dashed border-border px-5 py-6">
                    <span className="text-sm font-medium text-foreground">
                      Import what you already have
                    </span>
                    <span className="text-sm text-muted-foreground">
                      Studio scans the folders you pick for CAD models, drawings and parts lists,
                      and groups them into projects. Your files stay where they are.
                    </span>
                    <Button size="sm" variant="outline" onClick={importActions.scan}>
                      Scan this computer
                    </Button>
                  </div>
                ) : cards.length === 0 ? (
                  <p className="py-8 text-sm text-muted-foreground">
                    No projects yet. Describe one to start.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                    {rest.map(tile)}
                  </div>
                )}
              </section>
            </div>
          </div>
        </ImportDropZone>
      </div>
      <ImportDialogHost environmentId={environmentId} />
    </SidebarInset>
  );
}

function StartProject(props: { readonly environmentId: EnvironmentId }) {
  const { environmentId } = props;
  const start = useStartProject(environmentId);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const describe = useRef<HTMLTextAreaElement>(null);
  const hash = useLocation({ select: (location) => location.hash });
  // A workspace's New project (`ProjectSwitcher`) lands here: the box takes the typing.
  useEffect(() => {
    if (hash === "start") describe.current?.focus();
  }, [hash]);
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const blank = useMemo(() => {
    const available = availableTemplates(
      new Set((plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : []))),
    );
    return BLANK_WORK.flatMap((id) => available.filter((template) => template.id === id));
  }, [plugins]);

  // One start at a time: a second press while the project is being made does nothing.
  const run = async (work: ProjectStart) => {
    if (busy) return;
    setBusy(true);
    try {
      await start(work);
    } finally {
      setBusy(false);
    }
  };
  const ready = description.trim() !== "" && !busy;
  const startDescribed = () => {
    if (ready) void run({ kind: "described", description, files });
  };

  return (
    <section aria-label="Start a project" className="flex min-w-0 flex-col gap-3">
      <h2 className={SECTION_LABEL}>Start a project</h2>
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 shadow-xs/5 focus-within:border-ring">
        <Textarea
          ref={describe}
          unstyled
          rows={4}
          aria-label="Describe a new project"
          placeholder="Describe a new project"
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
          <div className="flex-1" />
          <Button size="sm" disabled={!ready} onClick={startDescribed}>
            Start
          </Button>
        </div>
      </div>
      {blank.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Or start a blank one to model by hand:</span>
          {blank.map((template) => (
            <Button
              key={template.id}
              variant="outline"
              size="xs"
              disabled={busy}
              onClick={() => void run({ kind: "blank", template })}
            >
              {template.label}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
