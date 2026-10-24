import type { EnvironmentId } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import { FilePlusIcon, FolderOpenIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { create as createStore } from "zustand";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { DISCIPLINE_ICONS, KIND_ICONS, KIND_TINTS } from "./kinds";
import { partLabel } from "./partNames";
import { useEngineeringInterface } from "./studioInterface";
import { useStudioProjectAt } from "./useStudioProjects";
import {
  DISCIPLINES,
  type Discipline,
  type NewTemplate,
  fileStem,
  isDocumentTemplate,
  newWorkPrompt,
} from "./newTemplates";

/**
 * Opens the project's New dialog from outside it (the panel's New over the Overview, the Document
 * menu's From a template), on one discipline or the first; the project page takes the request
 * (`ProjectPage`).
 */
export const useNewDialogStore = createStore<{
  /** New asked for, on a discipline or on none; null when not asked. */
  readonly request: { readonly discipline: Discipline | null } | null;
  readonly ask: (discipline?: Discipline) => void;
  readonly take: () => void;
}>()((set) => ({
  request: null,
  ask: (discipline) => set({ request: { discipline: discipline ?? null } }),
  take: () => set({ request: null }),
}));

/** What New starts in each discipline, as its description names it. */
const STARTS: Readonly<Record<Discipline, string>> = {
  CAD: "a part",
  Electronics: "a board",
  Analysis: "a study",
  Manufacturing: "a manufacturing job",
  Robotics: "a robot description",
  Documents: "a document",
};

/** New's work, as Create hands it on: what to start, its name and units, and the job in words. */
export interface NewJob {
  readonly template: NewTemplate;
  readonly name: string;
  readonly units: "mm" | "in";
  /** The job for the agent (`newWorkPrompt`). */
  readonly prompt: string;
}

/** Hands New's job to a chat: written into its composer, which sends it once it holds it. */
export function handToChat(composerRef: ComposerHandleRef, prompt: string): void {
  const composer = composerRef.current;
  if (composer === null) return;
  composer.insertTextAtEnd(prompt, { ensureLeadingBoundary: true });
  requestAnimationFrame(() => composer.submit());
}

/** A template's icon: the kind of thing it makes, a drawing's own, or a file of the person's. */
export function templateIcon(template: NewTemplate) {
  if (template.file !== undefined) return FilePlusIcon;
  return template.id === "drawing" ? KIND_ICONS.Drawings : DISCIPLINE_ICONS[template.discipline];
}

/** A template's icon color: its kind's, as the Overview and ⌘K color that kind (`KIND_TINTS`). */
export function templateTint(template: NewTemplate): string {
  if (template.file !== undefined || template.discipline === "Documents")
    return KIND_TINTS.Documents;
  if (template.id === "drawing") return KIND_TINTS.Drawings;
  return template.discipline === "Robotics" ? KIND_TINTS.CAD : KIND_TINTS[template.discipline];
}

function Field(props: {
  readonly label: string;
  readonly htmlFor?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3">
      <label
        htmlFor={props.htmlFor}
        className="text-2xs font-medium tracking-widest text-muted-foreground uppercase"
      >
        {props.label}
      </label>
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}

/**
 * New work, the way a CAD system's New dialog starts a part or a drawing, but
 * across engineering: the disciplines down the side, their templates beside
 * them, and the new work's properties (a name, a folder and units, or the
 * part it works from). Documents are templates too: the built-in ones (PRD,
 * requirements, FMEA, design review), and the person's own files
 * (`documentTemplates.ts`), with Add a template. Create hands the job on
 * (`onCreate`): into the open chat in a project, into a new project's first chat on Home.
 */
export function NewDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly templates: ReadonlyArray<NewTemplate>;
  /** The person's own document templates, offered under Documents. */
  readonly fileTemplates?: ReadonlyArray<NewTemplate>;
  /** Adds a template file (the desktop app's picker); null where it cannot. */
  readonly onAddTemplate?: (() => Promise<void>) | null;
  /** Shows the templates folder in Finder; null where it cannot. */
  readonly onShowTemplates?: (() => Promise<void>) | null;
  readonly initialTemplateId: string | null;
  /** The discipline it opens on, else the first template's. */
  readonly initialDiscipline?: Discipline;
  /** The project's parts, for a template that works from one. */
  readonly parts: ReadonlyArray<string>;
  /** On Home: Create makes a new project for the work, and the dialog says so. */
  readonly newProject?: boolean;
  /** Create: the work to start, for the host to hand to the agent; the dialog waits while it runs. */
  readonly onCreate: (job: NewJob) => void | Promise<unknown>;
}) {
  const id = useId();
  const fileTemplates = props.fileTemplates ?? [];
  const templates = [...props.templates, ...fileTemplates];
  const initial =
    templates.find((template) => template.id === props.initialTemplateId) ??
    (props.initialDiscipline === undefined
      ? undefined
      : templates.find((template) => template.discipline === props.initialDiscipline)) ??
    templates[0] ??
    null;
  const [selected, setSelected] = useState<NewTemplate | null>(initial);
  const [discipline, setDiscipline] = useState<Discipline>(
    props.initialDiscipline ?? initial?.discipline ?? "CAD",
  );
  const brief = useStudioProjectAt(props.environmentId, props.cwd)?.project.brief ?? null;
  const [name, setName] = useState(initial?.defaultName ?? "");
  const [folder, setFolder] = useState(initial?.folder ?? "");
  const [units, setUnits] = useState<"mm" | "in">(brief?.units ?? "mm");
  const [part, setPart] = useState<string | null>(props.parts[0] ?? null);
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const pick = (template: NewTemplate) => {
    setSelected(template);
    setName(template.defaultName);
    setFolder(template.folder);
  };
  const offered = DISCIPLINES.filter(
    (entry) =>
      templates.some((template) => template.discipline === entry) ||
      (entry === "Documents" && props.onAddTemplate),
  );
  const starts = offered.map((entry) => STARTS[entry]);
  const startLine =
    starts.length < 2 ? starts.join("") : `${starts.slice(0, -1).join(", ")} or ${starts.at(-1)}`;
  const needsPart = selected?.source === "from-part";
  const writesDocument = selected !== null && isDocumentTemplate(selected);
  // A part by its name in the engineering interface, by its path with code tools on.
  const plainWords = useEngineeringInterface();
  const partShown = (path: string) => (plainWords ? partLabel(path) : path);
  const ready = selected !== null && (needsPart ? part !== null : name.trim() !== "") && !creating;

  const create = () => {
    if (selected === null || creating) return;
    const started = props.onCreate({
      template: selected,
      name,
      units,
      prompt: newWorkPrompt({
        template: selected,
        name,
        folder,
        units,
        part: part === null ? null : serializeComposerFileLink(part),
        description,
        ...(selected.file === undefined
          ? {}
          : { templateLink: serializeComposerFileLink(selected.file) }),
      }),
    });
    // A new project takes a moment to make: Create says so until its chat opens.
    if (started instanceof Promise) {
      setCreating(true);
      void started.finally(() => {
        setCreating(false);
        props.onOpenChange(false);
      });
    } else {
      props.onOpenChange(false);
    }
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New</DialogTitle>
          <DialogDescription>
            {starts.length === 0
              ? ""
              : `Start ${startLine}${props.newProject ? " in a new project" : ""}. `}
            Create hands it to the agent.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="grid gap-4 border-t border-border pt-3 sm:grid-cols-[9rem_minmax(0,1fr)]">
            <nav aria-label="Disciplines" className="flex gap-1 overflow-x-auto sm:flex-col">
              {offered.map((entry) => {
                const Icon = DISCIPLINE_ICONS[entry];
                return (
                  <button
                    key={entry}
                    type="button"
                    aria-current={discipline === entry}
                    onClick={() => setDiscipline(entry)}
                    className={cn(
                      "flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-left text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      discipline === entry
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                    {entry}
                  </button>
                );
              })}
            </nav>
            <div className="flex min-w-0 flex-col gap-4">
              <div role="listbox" aria-label="Templates" className="grid gap-2 sm:grid-cols-2">
                {templates
                  .filter((template) => template.discipline === discipline)
                  .map((template) => {
                    const Icon = templateIcon(template);
                    const active = selected?.id === template.id;
                    return (
                      <button
                        key={template.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => pick(template)}
                        className={cn(
                          "flex min-w-0 items-start gap-2.5 rounded-md border px-3 py-2.5 text-left outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                          active
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-foreground/25",
                        )}
                      >
                        <Icon
                          className={cn("mt-0.5 size-4 shrink-0", templateTint(template))}
                          aria-hidden="true"
                        />
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-xs font-medium text-foreground">
                            {template.label}
                          </span>
                          <span className="text-2xs leading-snug text-muted-foreground">
                            {template.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
              </div>
              {discipline === "Documents" && (props.onAddTemplate || props.onShowTemplates) ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>Your own formats, such as a client's PRD:</span>
                  {props.onAddTemplate ? (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => void props.onAddTemplate?.()}
                    >
                      <FilePlusIcon />
                      Add a template
                    </Button>
                  ) : null}
                  {props.onShowTemplates ? (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => void props.onShowTemplates?.()}
                    >
                      <FolderOpenIcon />
                      Templates folder
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {selected === null ? null : (
                <div className="flex flex-col gap-2.5 border-t border-border pt-3">
                  {needsPart ? (
                    <Field label="Part">
                      {props.parts.length === 0 ? (
                        <span className="text-xs text-muted-foreground">
                          No parts in this project yet. Start with a part.
                        </span>
                      ) : (
                        <Select
                          value={part ?? ""}
                          onValueChange={(value) => setPart(value || null)}
                        >
                          <SelectTrigger size="sm" className="w-full" aria-label="Part">
                            <SelectValue>
                              {part === null ? "Choose a part" : partShown(part)}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectPopup alignItemWithTrigger={false}>
                            {props.parts.map((path) => (
                              <SelectItem key={path} hideIndicator value={path}>
                                {partShown(path)}
                              </SelectItem>
                            ))}
                          </SelectPopup>
                        </Select>
                      )}
                    </Field>
                  ) : (
                    <>
                      <Field label="Name" htmlFor={`${id}-name`}>
                        <Input
                          id={`${id}-name`}
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                        />
                      </Field>
                      {/* Where the file goes is the agent's to keep tidy in Studio. */}
                      {plainWords ? null : (
                        <Field label="Folder" htmlFor={`${id}-folder`}>
                          <Input
                            id={`${id}-folder`}
                            value={folder}
                            onChange={(event) => setFolder(event.target.value)}
                          />
                        </Field>
                      )}
                    </>
                  )}
                  {writesDocument ? null : (
                    <Field label="Units">
                      <Select
                        value={units}
                        onValueChange={(value) => setUnits(value === "in" ? "in" : "mm")}
                      >
                        <SelectTrigger size="sm" className="w-40" aria-label="Units">
                          <SelectValue>{units === "in" ? "Inches" : "Millimeters"}</SelectValue>
                        </SelectTrigger>
                        <SelectPopup alignItemWithTrigger={false}>
                          <SelectItem hideIndicator value="mm">
                            Millimeters
                          </SelectItem>
                          <SelectItem hideIndicator value="in">
                            Inches
                          </SelectItem>
                        </SelectPopup>
                      </Select>
                    </Field>
                  )}
                  <Field
                    label={writesDocument ? "What it covers" : "What it is"}
                    htmlFor={`${id}-description`}
                  >
                    <Textarea
                      id={`${id}-description`}
                      size="sm"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={
                        writesDocument
                          ? "Anything it should say, or leave out"
                          : needsPart
                            ? "Anything the agent should know: loads, machine, finish"
                            : "Size, features, what it attaches to"
                      }
                    />
                  </Field>
                  {plainWords || needsPart || name.trim() === "" ? null : (
                    <p className="text-2xs text-muted-foreground">
                      Saved as {(folder.trim() || selected.folder).replace(/\/+$/, "")}/
                      {fileStem(name)}
                      {writesDocument ? ".md" : ""}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={create} disabled={!ready}>
            {creating ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
