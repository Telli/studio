import { AuthFilesystemWriteScope, type EnvironmentId } from "@t3tools/contracts";
import { PaperclipIcon } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentScope } from "~/state/session";
import { useAtomCommand } from "~/state/use-atom-command";
import { useAtomQueryRunner } from "~/state/use-atom-query-runner";
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
import { toastManager } from "../ui/toast";
import {
  BRIEF_MARKDOWN,
  BRIEF_REFERENCES,
  EMPTY_BRIEF,
  PROCESSES,
  type ProjectBrief as Brief,
  agentsWithBrief,
  briefMarkdown,
  briefSummary,
  claudeWithBrief,
} from "./briefFolder";
import { PROJECT_FILE, parseStudioProject, studioProjectJson } from "./studioProject";
import { useProjectBrief } from "./useProjectBrief";

const projectNameOf = (cwd: string) =>
  cwd
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() || "This project";

/** One line of the spec sheet: its label in a drawing's tracked capitals, its field beside it. */
function SpecRow(props: {
  readonly label: string;
  readonly htmlFor?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3 border-b border-border py-2.5 last:border-b-0">
      <label
        htmlFor={props.htmlFor}
        className="pt-2 text-2xs font-medium tracking-widest text-muted-foreground uppercase"
      >
        {props.label}
      </label>
      <div className="min-w-0">{props.children}</div>
    </div>
  );
}

/**
 * The project brief on a new thread, in the engineering interface: one line
 * saying what the project is set up for, or asking to set it up. The sheet it
 * opens gathers the brief into `brief/` (`briefFolder.ts`) and hands
 * reference files to the agent to file under `brief/references/`.
 */
export function ProjectBriefRow(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly composerRef: ComposerHandleRef;
}) {
  const stored = useProjectBrief(props.environmentId, props.cwd);
  // What this sheet last saved wins over a read that has not caught up yet.
  const [saved, setSaved] = useState<{ readonly cwd: string; readonly brief: Brief } | null>(null);
  const brief = saved !== null && saved.cwd === props.cwd ? saved.brief : stored.brief;
  const [open, setOpen] = useState(false);
  // Each opening starts the sheet from the brief as it stands.
  const [opened, setOpened] = useState(0);

  return (
    <div className="pointer-events-auto mt-6 text-left">
      <div className="flex min-h-9 items-center gap-3 border-y border-border px-2">
        <span className="text-2xs font-medium tracking-widest text-muted-foreground uppercase">
          Project brief
        </span>
        {brief === null ? (
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            What the agent should know first: purpose, requirements, material, process
          </span>
        ) : (
          <dl className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden text-xs">
            {briefSummary(brief).map((entry) => (
              <div key={entry.label} className="flex min-w-0 shrink items-baseline gap-1.5">
                <dt className="sr-only">{entry.label}</dt>
                <dd className="truncate text-foreground">{entry.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <Button
          variant={brief === null ? "default" : "ghost-muted"}
          size="xs"
          onClick={() => {
            setOpened((count) => count + 1);
            setOpen(true);
          }}
        >
          {brief === null ? "Set up the brief" : "Edit"}
        </Button>
      </div>
      <BriefSheet
        key={opened}
        open={open}
        onOpenChange={setOpen}
        environmentId={props.environmentId}
        cwd={props.cwd}
        initial={brief ?? EMPTY_BRIEF}
        composerRef={props.composerRef}
        onSaved={(next) => setSaved({ cwd: props.cwd, brief: next })}
      />
    </div>
  );
}

function BriefSheet(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly initial: Brief;
  readonly composerRef: ComposerHandleRef;
  readonly onSaved: (brief: Brief) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<Brief>(props.initial);
  const [saving, setSaving] = useState(false);
  const [attached, setAttached] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const canWrite = useEnvironmentScope(props.environmentId, AuthFilesystemWriteScope);
  const writeFile = useAtomCommand(projectEnvironment.writeFile, { reportFailure: false });
  const readFile = useAtomQueryRunner(projectEnvironment.readFile, {
    reportFailure: false,
    refresh: true,
  });
  const set = <K extends keyof Brief>(key: K, value: Brief[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const read = async (relativePath: string) => {
    const result = await readFile({
      environmentId: props.environmentId,
      input: { cwd: props.cwd, relativePath },
    });
    return result._tag === "Success" ? result.value.contents : null;
  };
  const write = async (relativePath: string, contents: string) => {
    const result = await writeFile({
      environmentId: props.environmentId,
      input: { cwd: props.cwd, relativePath, contents },
    });
    if (result._tag !== "Success") throw new Error(`Could not write ${relativePath}`);
  };

  const save = async () => {
    setSaving(true);
    try {
      // The project file holds the brief; the project keeps its name and template.
      const project = parseStudioProject(await read(PROJECT_FILE));
      const name = project?.name || projectNameOf(props.cwd);
      await write(
        PROJECT_FILE,
        studioProjectJson({ name, template: project?.template ?? null, brief: draft }),
      );
      await write(BRIEF_MARKDOWN, briefMarkdown(draft, name));
      const agents = agentsWithBrief(await read("AGENTS.md"));
      if (agents !== null) await write("AGENTS.md", agents);
      const claude = claudeWithBrief(await read("CLAUDE.md"));
      if (claude !== null) await write("CLAUDE.md", claude);
      props.onSaved(draft);
      props.onOpenChange(false);
      toastManager.add({
        type: "success",
        title: "Brief saved",
        description: `${BRIEF_MARKDOWN}, which every agent reads first`,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not save the brief",
        description: error instanceof Error ? error.message : "Writing to the project failed.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Reference files go to the agent, which files them: the project takes text writes only.
  const attach = (files: File[]) => {
    const composer = props.composerRef.current;
    if (!composer || files.length === 0) return;
    composer.addDroppedFiles(files);
    composer.insertTextAtEnd(
      `File the attached references under ${BRIEF_REFERENCES}/ and list them in ${BRIEF_MARKDOWN}.`,
      { ensureLeadingBoundary: true },
    );
    setAttached((count) => count + files.length);
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(next) => {
        if (!saving) props.onOpenChange(next);
      }}
    >
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Project brief</DialogTitle>
          <DialogDescription>
            What this project is for, before any design work. Saved in the project file
            (studio.json) and {BRIEF_MARKDOWN}, which AGENTS.md points every agent to.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="border-t border-border">
            <SpecRow label="Purpose" htmlFor={`${id}-purpose`}>
              <Textarea
                id={`${id}-purpose`}
                size="sm"
                value={draft.purpose}
                onChange={(event) => set("purpose", event.target.value)}
                placeholder="What is it, and what must it do?"
              />
            </SpecRow>
            <SpecRow label="Requirements" htmlFor={`${id}-requirements`}>
              <Textarea
                id={`${id}-requirements`}
                size="sm"
                value={draft.requirements}
                onChange={(event) => set("requirements", event.target.value)}
                placeholder="Loads, environment, fits, standards it must meet"
              />
            </SpecRow>
            <SpecRow label="Units">
              <Select
                value={draft.units}
                onValueChange={(value) => set("units", value === "in" ? "in" : "mm")}
              >
                <SelectTrigger size="sm" className="w-40" aria-label="Units">
                  <SelectValue>{draft.units === "in" ? "Inches" : "Millimeters"}</SelectValue>
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
            </SpecRow>
            <SpecRow label="Material" htmlFor={`${id}-material`}>
              <Input
                id={`${id}-material`}
                value={draft.material}
                onChange={(event) => set("material", event.target.value)}
                placeholder="6061-T6 aluminum, PETG, FR-4..."
              />
            </SpecRow>
            <SpecRow label="Process">
              <Select
                value={draft.process}
                onValueChange={(value) => {
                  const process = PROCESSES.find((entry) => entry === value);
                  if (process) set("process", process);
                }}
              >
                <SelectTrigger size="sm" className="w-64" aria-label="Process">
                  <SelectValue>{draft.process}</SelectValue>
                </SelectTrigger>
                <SelectPopup alignItemWithTrigger={false}>
                  {PROCESSES.map((process) => (
                    <SelectItem key={process} hideIndicator value={process}>
                      {process}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </SpecRow>
            <SpecRow label="Quantity" htmlFor={`${id}-quantity`}>
              <Input
                id={`${id}-quantity`}
                className="w-40"
                inputMode="numeric"
                value={draft.quantity}
                onChange={(event) => set("quantity", event.target.value)}
                placeholder="1"
              />
            </SpecRow>
            <SpecRow label="Links" htmlFor={`${id}-links`}>
              <Textarea
                id={`${id}-links`}
                size="sm"
                value={draft.links}
                onChange={(event) => set("links", event.target.value)}
                placeholder="Datasheets, suppliers, inspiration: one per line"
              />
            </SpecRow>
            <SpecRow label="Notes" htmlFor={`${id}-notes`}>
              <Textarea
                id={`${id}-notes`}
                size="sm"
                value={draft.notes}
                onChange={(event) => set("notes", event.target.value)}
                placeholder="Anything else the agent should know"
              />
            </SpecRow>
            <SpecRow label="References">
              <div
                className="flex min-h-16 flex-col items-start justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-xs text-muted-foreground"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  attach([...event.dataTransfer.files]);
                }}
              >
                <span>
                  Drop sketches, photos, datasheets or mating parts. The agent files them under{" "}
                  {BRIEF_REFERENCES}/ with your next message.
                </span>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="xs" onClick={() => fileInput.current?.click()}>
                    <PaperclipIcon />
                    Choose files
                  </Button>
                  {attached === 0 ? null : (
                    <span role="status" className="text-foreground">
                      {attached === 1 ? "1 file" : `${attached} files`} ready to send with your next
                      message
                    </span>
                  )}
                </div>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  hidden
                  onChange={(event) => {
                    attach([...(event.target.files ?? [])]);
                    event.target.value = "";
                  }}
                />
              </div>
            </SpecRow>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => props.onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={!canWrite || saving}>
            {saving ? "Saving..." : "Save brief"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
