/**
 * A project's brief: what Studio and the agent should know before any design
 * work, gathered once in a folder of its own. `brief/brief.json` holds the
 * fields (so the form can be edited again); `brief/project.md` is written from
 * them for the agent;
 * `brief/references/` holds the sketches, photos, datasheets and mating parts.
 * A pointer in AGENTS.md (Codex and most agents) and CLAUDE.md (Claude Code)
 * makes every agent read the brief on every turn.
 */

export const BRIEF_DIR = "brief";
export const BRIEF_JSON = `${BRIEF_DIR}/brief.json`;
export const BRIEF_MARKDOWN = `${BRIEF_DIR}/project.md`;
export const BRIEF_REFERENCES = `${BRIEF_DIR}/references`;

export const PROCESSES = [
  "Not decided",
  "CNC machining",
  "3D printing (FDM)",
  "3D printing (resin)",
  "Sheet metal",
  "Laser or waterjet cutting",
  "Injection molding",
  "Printed circuit board",
] as const;

export interface ProjectBrief {
  /** What it is and what it must do. */
  readonly purpose: string;
  /** Loads, environment, fits, standards: what it must survive and meet. */
  readonly requirements: string;
  readonly units: "mm" | "in";
  readonly material: string;
  readonly process: (typeof PROCESSES)[number];
  readonly quantity: string;
  /** One per line: suppliers, datasheets, inspiration. */
  readonly links: string;
  readonly notes: string;
}

export const EMPTY_BRIEF: ProjectBrief = {
  purpose: "",
  requirements: "",
  units: "mm",
  material: "",
  process: "Not decided",
  quantity: "",
  links: "",
  notes: "",
};

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** A brief from `brief/brief.json`; null when the file is missing or is not a brief. */
export function parseBrief(json: string | null | undefined): ProjectBrief | null {
  if (!json) return null;
  try {
    const raw: unknown = JSON.parse(json);
    if (typeof raw !== "object" || raw === null) return null;
    const value = raw as Record<string, unknown>;
    const process = PROCESSES.find((entry) => entry === value.process) ?? "Not decided";
    return {
      purpose: text(value.purpose),
      requirements: text(value.requirements),
      units: value.units === "in" ? "in" : "mm",
      material: text(value.material),
      process,
      quantity: text(value.quantity),
      links: text(value.links),
      notes: text(value.notes),
    };
  } catch {
    return null;
  }
}

const section = (title: string, body: string) =>
  body.trim() === "" ? [] : [`## ${title}`, "", body.trim(), ""];

/** `brief/project.md`: the brief as the agent reads it. */
export function briefMarkdown(brief: ProjectBrief, projectName: string): string {
  const links = brief.links
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `- ${line}`)
    .join("\n");
  const spec = [
    "| Spec | Value |",
    "| --- | --- |",
    `| Units | ${brief.units} |`,
    `| Material | ${brief.material.trim() || "Not decided"} |`,
    `| Process | ${brief.process} |`,
    `| Quantity | ${brief.quantity.trim() || "Not decided"} |`,
  ].join("\n");
  return [
    `# ${projectName}: project brief`,
    "",
    "Written by Studio from the project's brief (`brief/brief.json`). Read it before any design",
    `work. Work in ${brief.units}, and design for the material and process below unless asked otherwise.`,
    `Reference files (sketches, photos, datasheets, mating parts) are in \`${BRIEF_REFERENCES}/\`.`,
    "",
    ...section("Purpose", brief.purpose),
    ...section("Requirements", brief.requirements),
    "## Spec",
    "",
    spec,
    "",
    ...section("Links", links),
    ...section("Notes", brief.notes),
  ].join("\n");
}

const AGENTS_MARKER = "<!-- studio:brief -->";

/** AGENTS.md with the brief's pointer added once; null when it is already there. */
export function agentsWithBrief(existing: string | null): string | null {
  if (existing?.includes(AGENTS_MARKER) || existing?.includes(BRIEF_MARKDOWN)) return null;
  const pointer = [
    AGENTS_MARKER,
    "## Project brief",
    "",
    `Read \`${BRIEF_MARKDOWN}\` before any design work: it says what this project is for, its`,
    `requirements, units, material and process. Reference files are in \`${BRIEF_REFERENCES}/\`.`,
    "",
  ].join("\n");
  return existing === null || existing.trim() === ""
    ? `# Agent instructions\n\n${pointer}`
    : `${existing.replace(/\s*$/, "")}\n\n${pointer}`;
}

/** CLAUDE.md with the brief imported once (Claude Code reads CLAUDE.md, not AGENTS.md); null when it is. */
export function claudeWithBrief(existing: string | null): string | null {
  if (existing?.includes(`@${BRIEF_MARKDOWN}`) || existing?.includes("@AGENTS.md")) return null;
  if (existing === null || existing.trim() === "") return "@AGENTS.md\n";
  return `${existing.replace(/\s*$/, "")}\n\n@${BRIEF_MARKDOWN}\n`;
}

/** The brief in a line, for the new-thread screen once it is set. */
export function briefSummary(brief: ProjectBrief): ReadonlyArray<{ label: string; value: string }> {
  return [
    { label: "Material", value: brief.material.trim() || "Not decided" },
    { label: "Process", value: brief.process },
    { label: "Units", value: brief.units },
    { label: "Quantity", value: brief.quantity.trim() || "Not decided" },
  ];
}
