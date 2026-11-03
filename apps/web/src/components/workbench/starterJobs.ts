import type { ProjectBrief } from "./briefFolder";
import { hardwareActions } from "./hardwareActions";
import { describePart } from "./partContext";
import { partLink } from "./partLink";
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

/** A study's picture: a `.glb` beside its numbers (`checkResults.ts`), a result, not a part. */
const isStudyPicture = (path: string, paths: ReadonlySet<string>) =>
  /\.glb$/i.test(path) &&
  (paths.has(path.replace(/\.glb$/i, ".json")) ||
    paths.has(path.replace(/\.glb$/i, ".result.json")));

/**
 * A new thread's starters, made from the project rather than fixed: the jobs
 * its most recently used parts, boards and studies take (a check first, then
 * a way to make it, the brief's own way of making it first), each one the
 * installed skills can do. A project with no files yet starts from its brief;
 * with neither, there is nothing to suggest. `paths` are the recent files as
 * they are, numbers beside pictures included.
 */
export function projectStarters(
  recentFiles: ReadonlyArray<ProjectFile>,
  skills: ReadonlySet<string>,
  brief: ProjectBrief | null,
  paths: ReadonlySet<string> = new Set(recentFiles.map((file) => file.path)),
): Starter[] {
  const subjects = recentFiles
    .filter((file) => STARTER_GROUPS.has(file.group) && !isStudyPicture(file.path, paths))
    .slice(0, 3);
  const starters: Starter[] = [];
  const add = (starter: Starter) => {
    if (starters.length < LIMIT && !starters.some((entry) => entry.label === starter.label)) {
      starters.push(starter);
    }
  };
  // A check for each recent file, then a way to make the most recent one.
  const jobs = subjects.map((file) => {
    // A cadgen 0.8 model is listed by its document id, with the name the engine gives it.
    const { name, kind } =
      file.document === undefined
        ? describePart(file.path, null)
        : { name: file.title, kind: file.kind };
    // Every job for the part, its ways of making it included, in menu order; starters start jobs,
    // so a write-up (no skill of its own) comes after the work.
    const all = hardwareActions(kind, skills, brief?.process)
      .flatMap((menu) => [...menu.sections, ...menu.others])
      .flatMap((section) => section.actions)
      .filter((action) => action.skill !== null);
    return {
      link: partLink({ path: file.path, name: file.title }),
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
