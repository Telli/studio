import { EMPTY_BRIEF, parseBrief, type ProjectBrief } from "./briefFolder";

/**
 * A Studio project is a folder, and `studio.json` at its root is its project
 * file, the way a `.kicad_pro` is a KiCad project's: what the project is
 * called, what kind of project it started as, and its brief (purpose,
 * requirements, units, material, process, quantity, links, notes). Studio
 * writes `brief/project.md` from it for the agent. A project from before the
 * file kept its brief in `brief/brief.json`, which still reads.
 */
export const PROJECT_FILE = "studio.json";
export const LEGACY_BRIEF_FILE = "brief/brief.json";

export interface ProjectTemplate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Where its work goes, for the agent (AGENTS.md) and the project page. */
  readonly layout: ReadonlyArray<readonly [folder: string, holds: string]>;
  readonly process: ProjectBrief["process"];
}

const MECHANICAL: ProjectTemplate["layout"] = [
  ["parts/", "model scripts and the STEP parts they build"],
  ["assemblies/", "assemblies of the parts"],
  ["drawings/", "engineering drawings and cut files (DXF)"],
  ["studies/", "FEA studies and their results"],
  ["manufacturing/", "CAM jobs, G-code, slices and order files"],
  ["docs/", "plans, reports, test plans and instructions"],
];
const ELECTRICAL: ProjectTemplate["layout"] = [
  ["electronics/", "boards, schematics and harnesses, with their Gerbers and BOMs"],
];

export const PROJECT_TEMPLATES: ReadonlyArray<ProjectTemplate> = [
  {
    id: "part",
    label: "Mechanical part",
    description: "One part or a few: modeled, checked and made.",
    layout: MECHANICAL,
    process: "Not decided",
  },
  {
    id: "product",
    label: "Product",
    description: "An enclosure, its parts and the electronics inside.",
    layout: [...MECHANICAL.slice(0, 2), ...ELECTRICAL, ...MECHANICAL.slice(2)],
    process: "Not decided",
  },
  {
    id: "board",
    label: "Circuit board",
    description: "A board from schematic to fabrication files.",
    layout: [...ELECTRICAL, ["docs/", "plans, reports, test plans and instructions"]],
    process: "Printed circuit board",
  },
  {
    id: "robot",
    label: "Robot",
    description: "Links, joints and actuators, described for simulation.",
    layout: [
      ...MECHANICAL.slice(0, 2),
      ["robots/", "robot descriptions (URDF, SRDF, SDF)"],
      ...ELECTRICAL,
      ...MECHANICAL.slice(3),
    ],
    process: "Not decided",
  },
  {
    id: "blank",
    label: "Blank",
    description: "No layout: start from nothing.",
    layout: [],
    process: "Not decided",
  },
];

export interface StudioProject {
  readonly name: string;
  /** The template it started as; null for a folder made a project another way. */
  readonly template: string | null;
  readonly brief: ProjectBrief;
}

/** `studio.json` as written: one flat object, readable and diffable by hand. */
export function studioProjectJson(project: StudioProject): string {
  return `${JSON.stringify(
    { studio: 1, name: project.name, template: project.template, ...project.brief },
    null,
    2,
  )}\n`;
}

/** The project file's project; null when it is missing or not one. */
export function parseStudioProject(json: string | null | undefined): StudioProject | null {
  const brief = parseBrief(json);
  if (brief === null || json == null) return null;
  const raw = JSON.parse(json) as Record<string, unknown>;
  if (raw.studio !== 1) return null;
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    template: typeof raw.template === "string" ? raw.template : null,
    brief,
  };
}

/** A project's brief: its project file's, else the brief a project kept before there was one. */
export function readProjectBrief(
  projectFile: string | null | undefined,
  legacyBrief: string | null | undefined,
): ProjectBrief | null {
  return parseStudioProject(projectFile)?.brief ?? parseBrief(legacyBrief);
}

const LAYOUT_MARKER = "<!-- studio:layout -->";

/** AGENTS.md with the template's layout said once: where each kind of work goes. */
export function agentsWithLayout(
  existing: string | null,
  template: ProjectTemplate,
): string | null {
  if (template.layout.length === 0 || existing?.includes(LAYOUT_MARKER)) return null;
  const section = [
    LAYOUT_MARKER,
    "## Project layout",
    "",
    "Keep this project's work where Studio's project page looks for it:",
    "",
    ...template.layout.map(([folder, holds]) => `- \`${folder}\`: ${holds}`),
    "",
  ].join("\n");
  return existing === null || existing.trim() === ""
    ? `# Agent instructions\n\n${section}`
    : `${existing.replace(/\s*$/, "")}\n\n${section}`;
}

/** A new project's brief: the template's process, the person's units, material and purpose. */
export function newProjectBrief(input: {
  readonly template: ProjectTemplate;
  readonly units: "mm" | "in";
  readonly material: string;
  readonly purpose: string;
}): ProjectBrief {
  return {
    ...EMPTY_BRIEF,
    units: input.units,
    material: input.material.trim(),
    process: input.template.process,
    purpose: input.purpose.trim(),
  };
}
