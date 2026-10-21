import { overviewParts } from "./checkResults";
import { partLabel } from "./partNames";
import { classifyProjectFile, type ProjectFile, type ProjectGroup } from "./projectFiles";

/**
 * What a project holds, as its sidebar lists it under the project (`StudioSidebar`), after its
 * chats: its CAD (parts, assemblies and their drawings), its electronics, the analysis and
 * manufacturing files the top bar's jobs made from them, and its documents. Images and the
 * references the brief gathered stay on the Overview.
 */
export type ContentsSection = "CAD" | "Electronics" | "Analysis" | "Manufacturing" | "Documents";

export const CONTENTS_SECTIONS: ReadonlyArray<ContentsSection> = [
  "CAD",
  "Electronics",
  "Analysis",
  "Manufacturing",
  "Documents",
];

/** The sections a person starts things in from New; the others fill as jobs run on the parts. */
export const STARTED_SECTIONS: ReadonlySet<ContentsSection> = new Set([
  "CAD",
  "Electronics",
  "Documents",
]);

const SECTION_OF: Partial<Record<ProjectGroup, ContentsSection>> = {
  CAD: "CAD",
  Drawings: "CAD",
  Electronics: "Electronics",
  Analysis: "Analysis",
  Manufacturing: "Manufacturing",
  Documents: "Documents",
};

export interface ContentsItem {
  /** The project folder it is in. */
  readonly root: string;
  readonly file: ProjectFile;
  /** What its row says: a part by its name, anything else with what it is ("Bracket FEA study"). */
  readonly label: string;
}

/** A row's words: kinds the file's folder decides ("Result", "Toolpath") are said after its name. */
function labelOf(file: ProjectFile): string {
  return file.kind === "Result" || file.kind === "Toolpath"
    ? `${file.title} ${file.kind.toLowerCase()}`
    : partLabel(file.path);
}

/** Of two files that are one thing (a study's data and its model), the one that shows it. */
const SHOWS = [/\.glb$/i, /\.pdf$/i];
const showRank = (path: string) => {
  const rank = SHOWS.findIndex((test) => test.test(path));
  return rank === -1 ? SHOWS.length : rank;
};

/**
 * The project's folders' files by section, each thing once: a part as the Overview lists it (a
 * mesh beside its STEP folded in), and a result, job or drawing whose files share a folder and a
 * name as the file that shows it. Each section is in folder then name order; a section with
 * nothing in it is listed empty.
 */
export function projectContents(
  folders: ReadonlyArray<{ readonly root: string; readonly paths: ReadonlyArray<string> | null }>,
): Array<{ readonly section: ContentsSection; readonly items: ContentsItem[] }> {
  const items: ContentsItem[] = [];
  for (const folder of folders) {
    const files = (folder.paths ?? [])
      .map(classifyProjectFile)
      .filter((file): file is ProjectFile => file !== null)
      .filter((file) => !/^readme\.md$/i.test(file.path));
    for (const file of overviewParts(files)) {
      items.push({ root: folder.root, file, label: labelOf(file) });
    }
    const kept = new Map<string, ProjectFile>();
    for (const file of files) {
      if (file.group === "CAD" || file.group === "Electronics") continue;
      if (SECTION_OF[file.group] === undefined) continue;
      const key = `${file.folder}\n${labelOf(file).toLowerCase()}`;
      const held = kept.get(key);
      if (held === undefined || showRank(file.path) < showRank(held.path)) kept.set(key, file);
    }
    for (const file of kept.values()) {
      items.push({ root: folder.root, file, label: labelOf(file) });
    }
  }
  return CONTENTS_SECTIONS.map((section) => ({
    section,
    items: items
      .filter((item) => SECTION_OF[item.file.group] === section)
      .toSorted(
        (a, b) =>
          a.root.localeCompare(b.root) ||
          a.file.folder.localeCompare(b.file.folder) ||
          a.label.localeCompare(b.label),
      ),
  }));
}
