import type { EnvironmentId } from "@t3tools/contracts";
import {
  STUDIO_PROJECT_KINDS,
  type StudioProjectKind,
  studioFolderKey,
  studioFolderName,
} from "@t3tools/shared/studioProjects";
import {
  BotIcon,
  BoxIcon,
  ChevronDownIcon,
  CircuitBoardIcon,
  FolderIcon,
  PackageIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";

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
import { AddFolderMenu } from "./AddFolderMenu";
import { MaterialPicker } from "./MaterialPicker";
import { useCreateStudioProject } from "./useCreateStudioProject";

const TEMPLATE_ICONS: Record<string, typeof BoxIcon> = {
  part: BoxIcon,
  product: PackageIcon,
  board: CircuitBoardIcon,
  robot: BotIcon,
  blank: SquareIcon,
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
 * A new project: what it is called, what kind of project it is (which tells
 * the agent where its work goes), the folders it is made of (none makes a new
 * one), its units and material, and a line on what it is for. Create saves it
 * and opens a thread in its first folder.
 */
export function NewProjectDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly environmentId: EnvironmentId;
  /** A folder to start from, as when making a project of a loose folder. */
  readonly initialFolder?: string | null;
}) {
  const id = useId();
  const create = useCreateStudioProject(props.environmentId);
  const [name, setName] = useState(
    props.initialFolder ? studioFolderName(props.initialFolder) : "",
  );
  const [template, setTemplate] = useState<StudioProjectKind>(STUDIO_PROJECT_KINDS[0]!);
  const [folders, setFolders] = useState<ReadonlyArray<string>>(
    props.initialFolder ? [props.initialFolder] : [],
  );
  const [units, setUnits] = useState<"mm" | "in">("mm");
  const [material, setMaterial] = useState("");
  const [purpose, setPurpose] = useState("");
  const [creating, setCreating] = useState(false);

  const submit = async () => {
    if (name.trim() === "" || creating) return;
    setCreating(true);
    const made = await create({
      environmentId: props.environmentId,
      name,
      kind: template,
      units,
      material,
      purpose,
      folders,
    });
    setCreating(false);
    if (made) props.onOpenChange(false);
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!creating) props.onOpenChange(open);
      }}
    >
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            One piece of work, made of one folder or several (the CAD, the board, the firmware),
            with a brief every agent in it reads first.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <div className="flex flex-col gap-4 border-t border-border pt-3">
            <Field label="Name" htmlFor={`${id}-name`}>
              <Input
                id={`${id}-name`}
                value={name}
                autoFocus
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void submit();
                }}
                placeholder="Shelf bracket, sensor pendant, rover arm"
              />
            </Field>
            <div
              role="radiogroup"
              aria-label="Kind of project"
              className="grid gap-2 sm:grid-cols-2"
            >
              {STUDIO_PROJECT_KINDS.map((entry) => {
                const Icon = TEMPLATE_ICONS[entry.id] ?? BoxIcon;
                const active = template.id === entry.id;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setTemplate(entry)}
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
                      <span className="text-xs font-medium text-foreground">{entry.label}</span>
                      <span className="text-2xs leading-snug text-muted-foreground">
                        {entry.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <Field label="Folders">
              <div className="flex flex-wrap items-center gap-1.5">
                {folders.map((folder) => (
                  <span
                    key={folder}
                    className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md border border-border ps-2 pe-0.5 text-xs text-foreground"
                  >
                    <FolderIcon
                      className="size-3 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="max-w-40 truncate">{studioFolderName(folder)}</span>
                    <Button
                      variant="ghost-muted"
                      size="icon-xs"
                      aria-label={`Leave ${studioFolderName(folder)} out`}
                      onClick={() =>
                        setFolders((current) =>
                          current.filter(
                            (entry) => studioFolderKey(entry) !== studioFolderKey(folder),
                          ),
                        )
                      }
                    >
                      <XIcon />
                    </Button>
                  </span>
                ))}
                <AddFolderMenu
                  environmentId={props.environmentId}
                  exclude={folders}
                  onAdd={(folder) => setFolders((current) => [...current, folder])}
                />
                {folders.length === 0 ? (
                  <span className="text-2xs text-muted-foreground">
                    None: Studio makes a new folder for it.
                  </span>
                ) : null}
              </div>
            </Field>
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
            <Field label="Material">
              <MaterialPicker
                value={material}
                onChange={setMaterial}
                trigger={
                  <Button variant="outline" size="sm" aria-label="Material">
                    {material === "" ? (
                      <span className="text-muted-foreground">Choose, or leave it for later</span>
                    ) : (
                      material
                    )}
                    <ChevronDownIcon className="opacity-60" aria-hidden="true" />
                  </Button>
                }
              />
            </Field>
            <Field label="What it is" htmlFor={`${id}-purpose`}>
              <Input
                id={`${id}-purpose`}
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                placeholder="A wall bracket that holds a 5 kg shelf"
              />
            </Field>
          </div>
        </DialogPanel>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => props.onOpenChange(false)}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button size="sm" onClick={() => void submit()} disabled={name.trim() === "" || creating}>
            {creating ? "Creating..." : "Create project"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
