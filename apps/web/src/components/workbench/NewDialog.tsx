import type { EnvironmentId } from "@t3tools/contracts";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import {
  ActivityIcon,
  BotIcon,
  BoxIcon,
  CircuitBoardIcon,
  FactoryIcon,
  FileTextIcon,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";

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
import { partLabel } from "./partNames";
import { useEngineeringInterface } from "./studioInterface";
import { useStudioProjectAt } from "./useStudioProjects";
import {
  DISCIPLINES,
  type Discipline,
  type NewTemplate,
  fileStem,
  newWorkPrompt,
} from "./newTemplates";

export const DISCIPLINE_ICONS: Record<Discipline, typeof BoxIcon> = {
  Mechanical: BoxIcon,
  Electrical: CircuitBoardIcon,
  Simulation: ActivityIcon,
  Manufacturing: FactoryIcon,
  Robotics: BotIcon,
  Documents: FileTextIcon,
};

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
 * part it works from). Create writes the job into the composer.
 */
export function NewDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly templates: ReadonlyArray<NewTemplate>;
  readonly initialTemplateId: string | null;
  /** The project's parts, for a template that works from one. */
  readonly parts: ReadonlyArray<string>;
  readonly composerRef: ComposerHandleRef;
}) {
  const id = useId();
  const { templates } = props;
  const initial =
    templates.find((template) => template.id === props.initialTemplateId) ?? templates[0] ?? null;
  const [selected, setSelected] = useState<NewTemplate | null>(initial);
  const [discipline, setDiscipline] = useState<Discipline>(initial?.discipline ?? "Mechanical");
  const brief = useStudioProjectAt(props.environmentId, props.cwd)?.project.brief ?? null;
  const [name, setName] = useState(initial?.defaultName ?? "");
  const [folder, setFolder] = useState(initial?.folder ?? "");
  const [units, setUnits] = useState<"mm" | "in">(brief?.units ?? "mm");
  const [part, setPart] = useState<string | null>(props.parts[0] ?? null);
  const [description, setDescription] = useState("");

  const pick = (template: NewTemplate) => {
    setSelected(template);
    setName(template.defaultName);
    setFolder(template.folder);
  };
  const offered = DISCIPLINES.filter((entry) =>
    templates.some((template) => template.discipline === entry),
  );
  const needsPart = selected?.source === "from-part";
  // A part by its name in the engineering interface, by its path with code tools on.
  const plainWords = useEngineeringInterface();
  const partShown = (path: string) => (plainWords ? partLabel(path) : path);
  const ready = selected !== null && (needsPart ? part !== null : name.trim() !== "");

  const create = () => {
    const composer = props.composerRef.current;
    if (selected === null || composer === null) return;
    composer.insertTextAtEnd(
      newWorkPrompt({
        template: selected,
        name,
        folder,
        units,
        part: part === null ? null : serializeComposerFileLink(part),
        description,
      }),
      { ensureLeadingBoundary: true },
    );
    props.onOpenChange(false);
    // Create starts the work: the composer sends once it holds the job.
    requestAnimationFrame(() => composer.submit());
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogPopup className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>New</DialogTitle>
          <DialogDescription>
            Start a part, a board, a study or a job. Create hands it to the agent.
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
                    const Icon = DISCIPLINE_ICONS[template.discipline];
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
                          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
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
                      <Field label="Folder" htmlFor={`${id}-folder`}>
                        <Input
                          id={`${id}-folder`}
                          value={folder}
                          onChange={(event) => setFolder(event.target.value)}
                        />
                      </Field>
                    </>
                  )}
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
                  <Field label="What it is" htmlFor={`${id}-description`}>
                    <Textarea
                      id={`${id}-description`}
                      size="sm"
                      value={description}
                      onChange={(event) => setDescription(event.target.value)}
                      placeholder={
                        needsPart
                          ? "Anything the agent should know: loads, machine, finish"
                          : "Size, features, what it attaches to"
                      }
                    />
                  </Field>
                  {needsPart || name.trim() === "" ? null : (
                    <p className="text-2xs text-muted-foreground">
                      Saved as {(folder.trim() || selected.folder).replace(/\/+$/, "")}/
                      {fileStem(name)}
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
            Create
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
