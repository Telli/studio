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
  readonly name: string;
  readonly folder: string;
  readonly group: ProjectGroup;
  /** What it is, in a word or two: "STEP", "Board", "G-code", "BOM". */
  readonly kind: string;
}

const RULES: ReadonlyArray<{
  readonly test: RegExp;
  readonly group: ProjectGroup;
  readonly kind: string;
}> = [
  { test: /\.fea\.(?:glb|json)$/i, group: "Studies", kind: "FEA study" },
  { test: /\.cam\.(?:glb|json)$/i, group: "Manufacturing", kind: "CAM job" },
  { test: /\.(?:nc|gcode|ngc|tap|gco)$/i, group: "Manufacturing", kind: "G-code" },
  { test: /\.(?:step|stp)$/i, group: "Models", kind: "STEP" },
  { test: /\.(?:stl|3mf|obj|glb)$/i, group: "Models", kind: "Mesh" },
  { test: /\.(?:urdf|sdf|srdf)$/i, group: "Models", kind: "Robot" },
  { test: /\.kicad_pcb$/i, group: "Boards and wiring", kind: "Board" },
  { test: /\.kicad_sch$/i, group: "Boards and wiring", kind: "Schematic" },
  { test: /\.harness\.ya?ml$/i, group: "Boards and wiring", kind: "Harness" },
  { test: /\.(?:dxf|dwg|svg)$/i, group: "Drawings", kind: "Drawing" },
  { test: /\.(?:md|mdx|pdf|txt)$/i, group: "Documents", kind: "Document" },
  { test: /gerbers?\.zip$|\.(?:gbr|drl)$/i, group: "Manufacturing", kind: "Gerbers" },
  { test: /bom\.(?:csv|tsv)$/i, group: "Manufacturing", kind: "BOM" },
  { test: /pos\.(?:csv|tsv)$/i, group: "Manufacturing", kind: "Pick and place" },
  { test: /\.(?:csv|tsv|xlsx)$/i, group: "Documents", kind: "Table" },
  { test: /\.(?:png|jpe?g|webp|gif|heic)$/i, group: "Images", kind: "Image" },
];

/** Agent instructions and a repository's own files: not the project's work. */
const NOT_WORK = /(?:^|\/)(?:AGENTS|CLAUDE|GEMINI|CHANGELOG|LICENSE|CONTRIBUTING)\.md$/i;
const HIDDEN_FOLDER = /^(?:\..*|node_modules|__pycache__|dist|build|tmp)$/;

const kindOf = (path: string) => RULES.find((entry) => entry.test.test(path))?.kind ?? "File";

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
    return { path: normalized, name, folder, group: "References", kind: kindOf(normalized) };
  }
  const rule = RULES.find((entry) => entry.test.test(normalized));
  if (rule === undefined) return null;
  const file = { path: normalized, name, folder, group: rule.group, kind: rule.kind };
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
 * name, narrowed by a search over their paths.
 */
export function groupProjectFiles(
  paths: ReadonlyArray<string>,
  query = "",
): Array<{ readonly group: ProjectGroup; readonly files: ProjectFile[] }> {
  const needle = query.trim().toLowerCase();
  const files = paths
    .map(classifyProjectFile)
    .filter((file): file is ProjectFile => file !== null)
    .filter((file) => needle === "" || file.path.toLowerCase().includes(needle));
  return GROUP_ORDER.flatMap((group) => {
    const inGroup = files
      .filter((file) => file.group === group)
      .toSorted((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
    return inGroup.length === 0 ? [] : [{ group, files: inGroup }];
  });
}
