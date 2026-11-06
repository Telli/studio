import type { EnvironmentId } from "@t3tools/contracts";
import { PlusIcon } from "lucide-react";
import { useId, useState } from "react";

import { pluginEnvironment } from "~/state/plugins";
import { useAtomCommand } from "~/state/use-atom-command";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Textarea } from "../../ui/textarea";

/**
 * The tile at the head of My skills, a cover's size: asks a skill's name and what it is for, adds
 * it, and hands it to `onAdded`, which opens it on the editor for its steps.
 */
export function AddSkillTile(props: {
  readonly environmentId: EnvironmentId;
  readonly onAdded: (skill: string) => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const createSkill = useAtomCommand(pluginEnvironment.createSkill);
  const ready = title.trim() !== "" && description.trim() !== "";

  const add = async () => {
    const added = await createSkill({
      environmentId: props.environmentId,
      input: { title: title.trim(), description: description.trim() },
    });
    if (added._tag !== "Success") return;
    setOpen(false);
    setTitle("");
    setDescription("");
    props.onAdded(added.value.skill);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-40 min-w-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border text-sm font-medium text-foreground outline-none hover:border-foreground/25 hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <PlusIcon aria-hidden="true" className="size-5 text-primary" />
        Add a skill
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a skill</DialogTitle>
            <DialogDescription>
              A skill teaches the agent one job. It uses a skill when what you ask matches what the
              skill is for.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input
                id={`${id}-name`}
                value={title}
                autoFocus
                onChange={(event) => setTitle(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-for`}>What it is for</Label>
              <Textarea
                id={`${id}-for`}
                value={description}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!ready} onClick={() => void add()}>
              Add skill
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
