import type { StudioProject, StudioProjectBrief } from "@t3tools/contracts";

/**
 * Studio projects (`StudioProject` in contracts): a named grouping of folders
 * with one brief. The server finds a thread's project by its folder and gives
 * the agent the other folders and `studioProjectContext`; the web app shows
 * and edits them.
 */

export const STUDIO_PROCESSES = [
  "Not decided",
  "CNC machining",
  "3D printing (FDM)",
  "3D printing (resin)",
  "Sheet metal",
  "Laser or waterjet cutting",
  "Injection molding",
  "Printed circuit board",
] as const;

export const EMPTY_STUDIO_BRIEF: StudioProjectBrief = {
  purpose: "",
  requirements: "",
  units: "mm",
  material: "",
  process: "Not decided",
  quantity: "",
  links: "",
  notes: "",
};

export interface StudioProjectKind {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Where its work goes, told to the agent; empty for none. */
  readonly layout: ReadonlyArray<readonly [folder: string, holds: string]>;
  readonly process: (typeof STUDIO_PROCESSES)[number];
}

const MECHANICAL: StudioProjectKind["layout"] = [
  ["parts/", "model scripts and the STEP parts they build"],
  ["assemblies/", "assemblies of the parts"],
  ["drawings/", "engineering drawings and cut files (DXF)"],
  ["studies/", "FEA studies and their results"],
  ["manufacturing/", "CAM jobs, G-code, slices and order files"],
  ["docs/", "plans, reports, test plans and instructions"],
];
const ELECTRICAL: StudioProjectKind["layout"] = [
  ["electronics/", "boards, schematics and harnesses, with their Gerbers and BOMs"],
];

export const STUDIO_PROJECT_KINDS: ReadonlyArray<StudioProjectKind> = [
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

/** A folder path as compared: no trailing separator. */
export function studioFolderKey(folder: string): string {
  return folder.replace(/[\\/]+$/, "") || folder;
}

/** The folder's last segment, as a folder is named in Studio. */
export function studioFolderName(folder: string): string {
  return studioFolderKey(folder).split(/[\\/]/).pop() || folder;
}

/** The project a folder belongs to, with its id; null when it is in none. */
export function studioProjectAt(
  projects: Readonly<Record<string, StudioProject>>,
  folder: string,
): { readonly id: string; readonly project: StudioProject } | null {
  const key = studioFolderKey(folder);
  for (const [id, project] of Object.entries(projects)) {
    if (project.folders.some((entry) => studioFolderKey(entry) === key)) return { id, project };
  }
  return null;
}

/** The project's folders other than the one a thread works in. */
export function studioOtherFolders(project: StudioProject, folder: string): ReadonlyArray<string> {
  const key = studioFolderKey(folder);
  return project.folders.filter((entry) => studioFolderKey(entry) !== key);
}

/**
 * How an agent shows its work in Studio, in measure: one thing at a time in
 * the viewer, and a report when a job's results are worth keeping. Studio
 * opens the report, or the result, beside the chat.
 */
const SHOW_YOUR_WORK = [
  "The person works beside you in Studio, with the viewer next to this chat. Show them what you make, one thing at a time:",
  "",
  "- When you make or change something they should look at (a part, an assembly, a board, a drawing, a study's result, a toolpath), show it in the viewer (text-to-cad's `cad_open` or `cad_show`) and say in a line what they are looking at. Show the one that matters; do not open every file you touch.",
  "- When a job gives results worth keeping (an analysis, a check, a comparison, a CAM plan, a board review), round them up in a short report in `docs/` in this thread's folder: what was asked, what you did, the results with units, a picture of the result where it helps (made with `cadgen snapshot`, saved beside the report and linked from it), the verdict, and what to do next. Write it for an engineer, in plain words, without code. Studio opens it beside the chat.",
  "- A small change or a quick answer needs no report.",
].join("\n");

const section = (title: string, body: string) =>
  body.trim() === "" ? [] : [`## ${title}`, "", body.trim(), ""];

/**
 * What the agent is told about the project before any work: its folders
 * (which it can read and edit), how to work, the brief and where work goes.
 */
export function studioProjectContext(project: StudioProject, folder: string): string {
  const { brief } = project;
  const key = studioFolderKey(folder);
  const folders = project.folders.map(
    (entry) => `- \`${entry}\`${studioFolderKey(entry) === key ? " (this thread's folder)" : ""}`,
  );
  const links = brief.links
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
  const layout = STUDIO_PROJECT_KINDS.find((kind) => kind.id === project.template)?.layout ?? [];
  return [
    `# Studio project: ${project.name}`,
    "",
    "This thread is part of a hardware project made of these folders. Read and change files in",
    "any of them as the work needs, by their full paths:",
    "",
    ...folders,
    "",
    `Work in ${brief.units}, and design for the material and process below unless asked otherwise.`,
    "",
    ...section("Purpose", brief.purpose),
    ...section("Requirements", brief.requirements),
    "## Spec",
    "",
    `- Units: ${brief.units}`,
    `- Material: ${brief.material.trim() || "Not decided"}`,
    `- Process: ${brief.process.trim() || "Not decided"}`,
    `- Quantity: ${brief.quantity.trim() || "Not decided"}`,
    "",
    ...section("Links", links),
    ...section("Notes", brief.notes),
    ...section("Show your work", SHOW_YOUR_WORK),
    ...section(
      "Where work goes",
      layout.length === 0
        ? ""
        : [
            `In \`${project.folders[0] ?? folder}\`, keep the project's work where Studio looks for it:`,
            "",
            ...layout.map(([path, holds]) => `- \`${path}\`: ${holds}`),
          ].join("\n"),
    ),
  ]
    .join("\n")
    .trimEnd();
}
