import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { PaperclipIcon, XIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { useNewThreadHandler } from "~/hooks/useHandleNewThread";
import { useNowMinute } from "~/hooks/useNowMinute";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { SidebarInset } from "../ui/sidebar";
import { Textarea } from "../ui/textarea";
import { availableTemplates } from "./newTemplates";
import type { ListedProject } from "./projectList";
import { ProjectTile } from "./ProjectTile";
import { ImportDialogHost } from "./ImportDialog";
import { ImportDropZone } from "./ImportDropZone";
import { NewFilesNotice } from "./NewFilesNotice";
import { findProjects } from "./recentProjects";
import { StudioTopBar } from "./StudioTopBar";
import { useImportActions } from "./useImportActions";
import { useOpenProject } from "./useOpenProject";
import { useProjectList } from "./useProjectList";
import { type ProjectStart, useStartProject } from "./useStartProject";

const SECTION_LABEL = "text-2xs font-medium tracking-widest text-muted-foreground uppercase";

/** Blank work Home offers to model by hand, in this order, each while its skill is on. */
const BLANK_WORK = ["part", "assembly", "board"] as const;

/**
 * Studio's Home, the way a CAD tool's welcome starts: describe a new project and Start makes it
 * and its first chat, or start a chat in a project you have, or a blank part to model by hand;
 * beside it, the projects worked on last.
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
  const [query, setQuery] = useState("");
  useNowMinute();
  const searching = query.trim() !== "";
  const shown = findProjects(cards, query).slice(0, searching ? 8 : 4);

  return (
    <SidebarInset className="h-dvh min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-background">
        <StudioTopBar section="home">
          <div className="w-full max-w-72">
            <Input
              type="search"
              size="sm"
              placeholder="Search projects and parts"
              aria-label="Search projects and parts"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </StudioTopBar>
        <ImportDropZone>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both">
            <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
              <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
              <NewFilesNotice environmentId={environmentId} />
              <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                <StartProject environmentId={environmentId} cards={cards} />
                <section aria-label="Recent projects" className="flex min-w-0 flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className={SECTION_LABEL}>
                      {searching ? "Matching projects" : "Recent projects"}
                    </h2>
                    <div className="flex-1" />
                    <Button variant="link" size="sm" render={<Link to="/projects" />}>
                      All projects
                    </Button>
                  </div>
                  {cards.length === 0 && importActions !== null ? (
                    <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border px-5 py-6">
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
                  ) : shown.length === 0 ? (
                    <p className="py-8 text-sm text-muted-foreground">
                      {cards.length === 0
                        ? "No projects yet. Describe one to start."
                        : "No project matches that."}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      {shown.map(({ id, project, folder, threads }) => (
                        <ProjectTile
                          key={id}
                          environmentId={environmentId}
                          project={project}
                          threads={threads}
                          onOpen={() => void openProject(folder, threads)}
                        />
                      ))}
                    </div>
                  )}
                  {importActions === null || cards.length === 0 ? null : (
                    <div>
                      <Button variant="link" size="sm" onClick={() => void importActions.pick()}>
                        Import files
                      </Button>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        </ImportDropZone>
      </div>
      <ImportDialogHost environmentId={environmentId} />
    </SidebarInset>
  );
}

function StartProject(props: {
  readonly environmentId: EnvironmentId;
  readonly cards: ReadonlyArray<ListedProject>;
}) {
  const { environmentId, cards } = props;
  const start = useStartProject(environmentId);
  const handleNewThread = useNewThreadHandler();
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
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
      {cards.length === 0 ? null : (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>Or start a chat in a project you have:</span>
          <Select
            value=""
            onValueChange={(id) => {
              const folder = cards.find((card) => card.id === id)?.folder ?? null;
              if (folder !== null) void handleNewThread(scopeProjectRef(environmentId, folder.id));
            }}
          >
            <SelectTrigger size="sm" aria-label="Choose a project">
              <SelectValue>Choose a project</SelectValue>
            </SelectTrigger>
            <SelectPopup alignItemWithTrigger={false}>
              {cards.map((card) => (
                <SelectItem key={card.id} hideIndicator value={card.id}>
                  {card.project.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>
      )}
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
