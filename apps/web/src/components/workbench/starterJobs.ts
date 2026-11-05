import type { ProjectBrief } from "./briefFolder";
import { type HardwareAction, hardwareActions } from "./hardwareActions";
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
 * its most recently used parts, boards and studies take, each kind of job once
 * (a check of how it is made, the brief's way first; strength, fit or mass; a
 * document; a way to make it), each one the installed skills can do. A project with no files yet starts from its brief;
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
  const jobs = subjects.map((file) => {
    // A cadgen 0.8 model is listed by its document id, with the name the engine gives it.
    const { name, kind } =
      file.document === undefined
        ? describePart(file.path, null)
        : { name: file.title, kind: file.kind };
    return {
      link: partLink({ path: file.path, name: file.title }),
      name: lowerName(name),
      // Every job for the part, its ways of making it included, in menu order. Starters start
      // work: a write-up (no skill of its own), an export or a bought part is none.
      all: hardwareActions(kind, skills, brief?.process)
        .flatMap((menu) => [...menu.sections, ...menu.others])
        .flatMap((section) => section.actions)
        .filter((action) => action.skill !== null && action.section !== "files"),
    };
  });
  // Each kind of job once, from the most recent file that takes it, so the starters cover the
  // work rather than one job on every part: a check of how it would be made (the brief's way
  // first), a check of strength, fit or mass, a document, then a way to make it. A kind no
  // installed skill does is left out, not filled with a second job of another kind.
  const kinds: ReadonlyArray<(action: HardwareAction) => boolean> = [
    (action) => action.group === "Manufacture" && action.checks,
    (action) => action.group === "Evaluate",
    (action) => action.group === "Document",
    (action) => action.group === "Manufacture" && !action.checks,
  ];
  for (const isKind of kinds) {
    for (const job of jobs) {
      const action = job.all.find(isKind);
      if (action) {
        add({ label: action.short(job.name), prompt: action.prompt(job.link) });
        break;
      }
    }
  }
  if (starters.length === 0 && brief !== null && brief.purpose.trim() !== "") {
    add({
      label: "Start the design from the brief",
      prompt: `Design the first part of this project from its brief: ${brief.purpose.trim()}`,
    });
  }
  return starters;
}
