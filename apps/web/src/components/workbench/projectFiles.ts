import { MANUFACTURING_PROCESSES } from "./checkResults";
import { humanName, partName } from "./partNames";

/**
 * A project the way an engineer files it, for the project page: models,
 * boards, drawings, studies and jobs, documents, fabrication files, images,
 * and the references the brief gathered. Source and configuration (the model
 * scripts, settings, environments) are left to the code interface.
 */

export type ProjectGroup =
  | "Models"
  | "Boards and wiring"
  | "Drawings"
  | "Studies"
  | "Manufacturing"
  | "Documents"
  | "Images"
  | "Reference parts"
  | "References";

const GROUP_ORDER: ReadonlyArray<ProjectGroup> = [
  "Models",
  "Boards and wiring",
  "Drawings",
  "Studies",
  "Manufacturing",
  "Documents",
  "Images",
  "Reference parts",
  "References",
];

export interface ProjectFile {
  readonly path: string;
  /** Its file name: "servo_bracket.step". */
  readonly name: string;
  /** What an engineer calls it: "Servo bracket" (`partNames.ts`). */
  readonly title: string;
  readonly folder: string;
  readonly group: ProjectGroup;
  /** What it is, in a word or two: "Part", "Board", "G-code", "Bill of materials". */
  readonly kind: string;
}

/** A manufacturing check's result model, `<stem>.<process>.glb` (`checkResults.ts`). */
const MANUFACTURING_RESULT = new RegExp(`\\.(?:${MANUFACTURING_PROCESSES.join("|")})\\.glb$`, "i");

/** Where each kind of file is filed; what it is and what it is called are `partNames.ts`'s. */
const RULES: ReadonlyArray<{ readonly test: RegExp; readonly group: ProjectGroup }> = [
  { test: /\.fea\.(?:glb|json)$/i, group: "Studies" },
  { test: MANUFACTURING_RESULT, group: "Studies" },
  { test: /\.cam\.(?:glb|json)$/i, group: "Manufacturing" },
  { test: /\.(?:nc|gcode|ngc|tap|gco)$/i, group: "Manufacturing" },
  { test: /\.(?:step|stp)$/i, group: "Models" },
  { test: /\.(?:stl|3mf|obj|glb)$/i, group: "Models" },
  { test: /\.(?:urdf|sdf|srdf)$/i, group: "Models" },
  { test: /\.kicad_pcb$/i, group: "Boards and wiring" },
  { test: /\.kicad_sch$/i, group: "Boards and wiring" },
  { test: /\.harness\.ya?ml$/i, group: "Boards and wiring" },
  { test: /\.(?:dxf|dwg|svg)$/i, group: "Drawings" },
  { test: /\.(?:md|mdx|pdf|txt)$/i, group: "Documents" },
  { test: /gerbers?\.zip$|\.(?:gbr|drl)$/i, group: "Manufacturing" },
  { test: /bom\.(?:csv|tsv)$/i, group: "Manufacturing" },
  { test: /pos\.(?:csv|tsv)$/i, group: "Manufacturing" },
  { test: /\.(?:csv|tsv|xlsx)$/i, group: "Documents" },
  { test: /\.(?:png|jpe?g|webp|gif|heic)$/i, group: "Images" },
];

/** Agent instructions and a repository's own files: not the project's work. */
const NOT_WORK = /(?:^|\/)(?:AGENTS|CLAUDE|GEMINI|CHANGELOG|LICENSE|CONTRIBUTING)\.md$/i;
const HIDDEN_FOLDER = /^(?:\..*|node_modules|__pycache__|dist|build|tmp)$/;

/** What it is and what it is called, or the file's own name for a file of no known kind. */
function named(path: string, name: string) {
  const known = partName(path);
  return { title: known?.name ?? name, kind: known?.kind ?? "File" };
}

/** The file as the project page shows it, or null when it is not the project's work. */
export function classifyProjectFile(path: string): ProjectFile | null {
  const normalized = path.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const name = segments.at(-1) ?? normalized;
  if (segments.slice(0, -1).some((segment) => HIDDEN_FOLDER.test(segment))) return null;
  if (name.startsWith(".") || NOT_WORK.test(normalized)) return null;
  const folder = segments.slice(0, -1).join("/");
  // What the brief gathered is its own tab, whatever kind of file it is.
  if (/^brief\//i.test(normalized)) {
    if (/^brief\/brief\.json$/i.test(normalized)) return null;
    return { path: normalized, name, folder, group: "References", ...named(normalized, name) };
  }
  const rule = RULES.find((entry) => entry.test.test(normalized));
  if (rule === undefined) return null;
  const file = { path: normalized, name, folder, group: rule.group, ...named(normalized, name) };
  if (rule.group !== "Models") return file;
  // A model's folder says what it is: a study's result, a CAM job's, or a part someone else made.
  const folders = segments.slice(0, -1);
  if (folders.some((segment) => STUDY_FOLDER.test(segment))) {
    return { ...file, group: "Studies", kind: "Result" };
  }
  if (folders.some((segment) => CAM_FOLDER.test(segment))) {
    return { ...file, group: "Manufacturing", kind: "Toolpath" };
  }
  if (folders.some((segment) => REFERENCE_FOLDER.test(segment))) {
    return { ...file, group: "Reference parts" };
  }
  return file;
}

const STUDY_FOLDER = /^(?:fea|sim|simulations?|stud(?:y|ies)|results?|analysis|analyses)$/i;
const CAM_FOLDER = /^(?:cam|toolpaths?|machining)$/i;
const REFERENCE_FOLDER =
  /^(?:references?|vendor|vendors|suppliers?|library|libs?|third[-_]?party|purchased|datasheets?|off[-_]?the[-_]?shelf)$/i;

/**
 * The project's files by group, in the page's order, each by folder then
 * name, narrowed by a search over their names, kinds and paths.
 */
export function groupProjectFiles(
  paths: ReadonlyArray<string>,
  query = "",
): Array<{ readonly group: ProjectGroup; readonly files: ProjectFile[] }> {
  const needle = query.trim().toLowerCase();
  const files = paths
    .map(classifyProjectFile)
    .filter((file): file is ProjectFile => file !== null)
    .filter(
      (file) =>
        needle === "" || `${file.path}\n${file.title}\n${file.kind}`.toLowerCase().includes(needle),
    );
  return GROUP_ORDER.flatMap((group) => {
    const inGroup = files
      .filter((file) => file.group === group)
      .toSorted((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
    return inGroup.length === 0 ? [] : [{ group, files: inGroup }];
  });
}

/**
 * Where a file sits, said only where it tells two alike apart: two parts
 * called Bracket read "V1" and "V2" after their folders. A file whose name
 * and kind are its own has none.
 */
export function filePlaces(files: ReadonlyArray<ProjectFile>): ReadonlyMap<string, string> {
  const key = (file: ProjectFile) => `${file.kind}\n${file.title.toLowerCase()}`;
  const counts = new Map<string, number>();
  for (const file of files) counts.set(key(file), (counts.get(key(file)) ?? 0) + 1);
  const places = new Map<string, string>();
  for (const file of files) {
    if ((counts.get(key(file)) ?? 0) < 2) continue;
    const folder = file.folder.split("/").at(-1);
    places.set(file.path, folder ? humanName(folder) : "Project folder");
  }
  return places;
}
