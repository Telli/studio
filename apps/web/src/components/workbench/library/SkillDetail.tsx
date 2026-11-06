import { MY_SKILLS_PLUGIN_ID, type EnvironmentId } from "@t3tools/contracts";
import { type ReactNode, useState } from "react";

import { requestConfirmDialog } from "~/confirmDialog";
import { cn } from "~/lib/utils";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import ChatMarkdown from "../../ChatMarkdown";
import { Button } from "../../ui/button";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../ui/dialog";
import { Textarea } from "../../ui/textarea";
import type { LibrarySkill } from "./libraryCatalog";
import { PluginsLink } from "./NeedsSkill";

/** What the agent reads of a skill's file, past the front matter that names it. */
export function skillBody(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n*/, "");
}

/**
 * A skill in full: its instructions and each of its other files, read as the agent reads them. One
 * of the person's own can be edited and removed; a plugin's stays as it shipped, since it is
 * replaced when the plugin updates, so Edit a copy makes one of their own (`onOwn`).
 */
export function SkillDetail(props: {
  readonly entry: LibrarySkill;
  readonly environmentId: EnvironmentId;
  /** Its name, as the Toolbox shows it. */
  readonly name: string;
  /** Opens on the editor: a skill just added or copied. */
  readonly startEditing: boolean;
  /** What it answers to and where it shows, under its description. */
  readonly facts: ReactNode;
  /** Opens the person's own skill of this name, on the editor. */
  readonly onOwn: (skill: string) => void;
  readonly onRemoved: () => void;
}) {
  const { entry, environmentId } = props;
  const own = entry.pluginId === MY_SKILLS_PLUGIN_ID;
  const [file, setFile] = useState<string | null>(null);
  const [editing, setEditing] = useState(props.startEditing);
  const [draft, setDraft] = useState<string | null>(null);
  const content = useEnvironmentQuery(
    pluginEnvironment.skill({
      environmentId,
      input: { pluginId: entry.pluginId, skill: entry.name, file },
    }),
  );
  const saveSkill = useAtomCommand(pluginEnvironment.saveSkill);
  const copySkill = useAtomCommand(pluginEnvironment.copySkill);
  const removeSkill = useAtomCommand(pluginEnvironment.removeSkill);
  const text = content.data?.text ?? "";
  const files = content.data?.files ?? [];

  const save = async () => {
    const saved = await saveSkill({
      environmentId,
      input: { skill: entry.name, text: draft ?? text },
    });
    if (saved._tag !== "Success") return;
    setEditing(false);
    setDraft(null);
  };
  const copy = async () => {
    const copied = await copySkill({
      environmentId,
      input: { pluginId: entry.pluginId, skill: entry.name },
    });
    if (copied._tag === "Success") props.onOwn(copied.value.skill);
  };
  const remove = async () => {
    const confirmed = await requestConfirmDialog(
      `Remove ${props.name}? Its files are deleted and the agent stops using it.`,
    );
    if (confirmed !== true) return;
    const removed = await removeSkill({ environmentId, input: { skill: entry.name } });
    if (removed._tag === "Success") props.onRemoved();
  };

  return (
    <DialogPopup className="max-w-4xl">
      <DialogHeader>
        <DialogTitle>{props.name}</DialogTitle>
        <DialogDescription>{entry.description}</DialogDescription>
      </DialogHeader>
      <DialogPanel>
        {props.facts}
        {entry.on ? null : (
          <p className="text-sm text-foreground">
            The {entry.pluginName} plugin is turned off. <PluginsLink />
          </p>
        )}
        {own ? null : (
          <p className="text-sm text-muted-foreground">
            This skill comes with {entry.pluginName} and updates with it. A copy is yours to change;
            jobs in the Toolbox keep using this one.
          </p>
        )}
        <div className={cn("grid min-w-0 gap-4", files.length > 0 && "sm:grid-cols-[11rem_1fr]")}>
          {files.length === 0 ? null : (
            <nav aria-label="Files in this skill" className="flex min-w-0 flex-col gap-0.5">
              {[null, ...files].map((path) => (
                <button
                  key={path ?? "instructions"}
                  type="button"
                  disabled={editing}
                  aria-current={path === file ? "true" : undefined}
                  onClick={() => setFile(path)}
                  className="truncate rounded-md px-2 py-1 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-64 aria-[current]:bg-accent"
                >
                  {path ?? "Instructions"}
                </button>
              ))}
            </nav>
          )}
          {editing ? (
            <Textarea
              aria-label={`Instructions for ${props.name}`}
              value={draft ?? text}
              onChange={(event) => setDraft(event.target.value)}
              rows={22}
            />
          ) : content.error !== null ? (
            <p className="text-sm text-muted-foreground">
              Could not read this skill. Restart Studio and try again.
            </p>
          ) : file === null || file.endsWith(".md") ? (
            <div className="min-w-0">
              <ChatMarkdown text={skillBody(text)} cwd={undefined} environmentId={environmentId} />
            </div>
          ) : (
            <pre className="min-w-0 overflow-auto rounded-lg border border-border p-3 font-mono text-xs">
              {text}
            </pre>
          )}
        </div>
      </DialogPanel>
      <DialogFooter>
        {editing ? (
          <>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setDraft(null);
              }}
            >
              Cancel
            </Button>
            <Button size="sm" disabled={content.data === null} onClick={() => void save()}>
              Save
            </Button>
          </>
        ) : own ? (
          <>
            <Button size="sm" variant="ghost" className="sm:me-auto" onClick={() => void remove()}>
              Remove
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setFile(null);
                setEditing(true);
              }}
            >
              Edit
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={() => void copy()}>
            Edit a copy
          </Button>
        )}
      </DialogFooter>
    </DialogPopup>
  );
}
