import type { ProjectBrief } from "./briefFolder";
import { hardwareActions } from "./hardwareActions";
import { describePart } from "./partContext";
import type { ProjectFile } from "./projectFiles";

export interface Starter {
  /** What the chip says: "Check l_bracket for CNC machining". */
  readonly label: string;
  /** What goes into the composer, naming the file by its path. */
  readonly prompt: string;
}

/** The kinds of project file a starter can be about, by group. */
const STARTER_GROUPS = new Set(["Models", "Boards and wiring", "Studies", "Drawings"]);
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
    const groups = hardwareActions(kind, skills);
    const of = (group: string) => groups.find((entry) => entry.group === group)?.actions ?? [];
    return { file, name, check: of("Check")[0], make: of("Make")[0], document: of("Document")[0] };
  });
  for (const job of jobs) {
    if (job.check)
      add({ label: job.check.short(job.name), prompt: job.check.prompt(job.file.path) });
  }
  for (const job of jobs) {
    const next = job.make ?? job.document;
    if (next) add({ label: next.short(job.name), prompt: next.prompt(job.file.path) });
  }
  if (starters.length === 0 && brief !== null && brief.purpose.trim() !== "") {
    add({
      label: "Start the design from the brief",
      prompt: `Design the first part of this project from its brief: ${brief.purpose.trim()}`,
    });
  }
  return starters;
}
