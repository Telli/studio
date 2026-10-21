import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";

import type { ProjectBrief } from "./briefFolder";
import { hardwareActions } from "./hardwareActions";
import { describePart } from "./partContext";
import { lowerName } from "./partNames";
import type { ProjectFile } from "./projectFiles";

export interface Starter {
  /** What the chip says: "Check L bracket for CNC machining". */
  readonly label: string;
  /** What goes into the composer, naming the part by a link to its file. */
  readonly prompt: string;
}

/** The kinds of project file a starter can be about, by group. */
const STARTER_GROUPS = new Set(["CAD", "Electronics", "Analysis", "Drawings"]);
const LIMIT = 4;

/**
 * A new thread's starters, made from the project rather than fixed: the jobs
 * its most recently used parts, boards and studies take (a check first, then
 * a way to make it), each one the installed skills can do. A project with no
 * files yet starts from its brief; with neither, there is nothing to suggest.
 */
export function projectStarters(
  recentFiles: ReadonlyArray<ProjectFile>,
  skills: ReadonlySet<string>,
  brief: ProjectBrief | null,
): Starter[] {
  const subjects = recentFiles.filter((file) => STARTER_GROUPS.has(file.group)).slice(0, 3);
  const starters: Starter[] = [];
  const add = (starter: Starter) => {
    if (starters.length < LIMIT && !starters.some((entry) => entry.label === starter.label)) {
      starters.push(starter);
    }
  };
  // A check for each recent file, then a way to make the most recent one.
  const jobs = subjects.map((file) => {
    const { name, kind } = describePart(file.path, null);
    // Every job for the part, its ways of making it included, in menu order; starters start jobs,
    // so a write-up (no skill of its own) comes after the work.
    const all = hardwareActions(kind, skills)
      .flatMap((menu) => [...menu.sections, ...menu.others])
      .flatMap((section) => section.actions)
      .filter((action) => action.skill !== null);
    return {
      link: serializeComposerFileLink(file.path),
      name: lowerName(name),
      // A check of how it would be made first, else any check; then a way to make it (an export
      // is a file, not a way to make it).
      check:
        all.find((action) => action.checks && action.group === "Manufacture") ??
        all.find((action) => action.checks),
      make: all.find(
        (action) => action.group === "Manufacture" && !action.checks && action.section !== "export",
      ),
      document: all.find((action) => action.group === "Document"),
    };
  });
  for (const job of jobs) {
    if (job.check) add({ label: job.check.short(job.name), prompt: job.check.prompt(job.link) });
  }
  for (const job of jobs) {
    const next = job.make ?? job.document;
    if (next) add({ label: next.short(job.name), prompt: next.prompt(job.link) });
  }
  if (starters.length === 0 && brief !== null && brief.purpose.trim() !== "") {
    add({
      label: "Start the design from the brief",
      prompt: `Design the first part of this project from its brief: ${brief.purpose.trim()}`,
    });
  }
  return starters;
}
