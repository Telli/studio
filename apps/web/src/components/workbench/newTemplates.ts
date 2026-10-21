/**
 * What a new piece of work can be, the way a CAD system's New dialog offers
 * templates (a part, an assembly, a drawing) but across engineering: boards
 * and harnesses, studies, manufacturing, robots, documents. Each runs on one
 * of text-to-cad's skills and is offered only while an enabled plugin has it.
 * A template either makes something new (a name, a folder, units) or works
 * from a part the project already holds (which one).
 */

export type Discipline =
  | "Mechanical"
  | "Electrical"
  | "Simulation"
  | "Manufacturing"
  | "Robotics"
  | "Documents";

export const DISCIPLINES: ReadonlyArray<Discipline> = [
  "Mechanical",
  "Electrical",
  "Simulation",
  "Manufacturing",
  "Robotics",
  "Documents",
];

export interface NewTemplate {
  readonly id: string;
  readonly discipline: Discipline;
  readonly label: string;
  readonly description: string;
  /** The text-to-cad skill it runs on; null for one any agent can do. */
  readonly skill: string | null;
  /** `new`: names a new file; `from-part`: works from a part the project holds. */
  readonly source: "new" | "from-part";
  /** Where a new one goes, and what it is called until named. */
  readonly folder: string;
  readonly defaultName: string;
  /** A document's sections, in order: a built-in document template (`documentTemplates.ts`). */
  readonly outline?: ReadonlyArray<string>;
  /** A document template of the person's own: the file the agent follows, by its full path. */
  readonly file?: string;
}

export const NEW_TEMPLATES: ReadonlyArray<NewTemplate> = [
  {
    id: "part",
    discipline: "Mechanical",
    label: "Part",
    description: "One solid, built from a model script you can change by its dimensions.",
    skill: "cad",
    source: "new",
    folder: "parts",
    defaultName: "part",
  },
  {
    id: "assembly",
    discipline: "Mechanical",
    label: "Assembly",
    description: "Parts placed together with mates, using the project's parts where they fit.",
    skill: "cad",
    source: "new",
    folder: "assemblies",
    defaultName: "assembly",
  },
  {
    id: "sheet-metal",
    discipline: "Mechanical",
    label: "Sheet metal part",
    description: "A bent sheet part with its flat pattern.",
    skill: "cad",
    source: "new",
    folder: "parts",
    defaultName: "sheet_part",
  },
  {
    id: "drawing",
    discipline: "Mechanical",
    label: "Drawing",
    description: "A dimensioned engineering drawing of a part.",
    skill: "engineering-drawing",
    source: "from-part",
    folder: "drawings",
    defaultName: "drawing",
  },
  {
    id: "board",
    discipline: "Electrical",
    label: "Board",
    description: "A KiCad board and schematic from the circuit you describe.",
    skill: "pcb",
    source: "new",
    folder: "electronics",
    defaultName: "board",
  },
  {
    id: "harness",
    discipline: "Electrical",
    label: "Wiring harness",
    description: "Connectors, wires and lengths, with its bill of materials.",
    skill: "harness",
    source: "new",
    folder: "electronics",
    defaultName: "harness",
  },
  {
    id: "strength-study",
    discipline: "Simulation",
    label: "Strength study",
    description: "Stress and deflection of a part under its working load.",
    skill: "fea",
    source: "from-part",
    folder: "studies",
    defaultName: "study",
  },
  {
    id: "cam-job",
    discipline: "Manufacturing",
    label: "CAM job",
    description: "Toolpaths and G-code for a 3-axis mill or router.",
    skill: "cam",
    source: "from-part",
    folder: "cam",
    defaultName: "job",
  },
  {
    id: "print",
    discipline: "Manufacturing",
    label: "3D print",
    description: "Sliced G-code for an FDM printer, checked before it prints.",
    skill: "gcode",
    source: "from-part",
    folder: "print",
    defaultName: "print",
  },
  {
    id: "cut-file",
    discipline: "Manufacturing",
    label: "Cut file",
    description: "A DXF for laser, waterjet or plasma cutting.",
    skill: "dxf",
    source: "from-part",
    folder: "cut",
    defaultName: "cut",
  },
  {
    id: "robot",
    discipline: "Robotics",
    label: "Robot description",
    description: "Links, joints and limits of an assembly, for simulation.",
    skill: "urdf",
    source: "from-part",
    folder: "robots",
    defaultName: "robot",
  },
  {
    id: "test-plan",
    discipline: "Documents",
    label: "Test plan",
    description: "Steps and pass criteria to prove a part does its job.",
    skill: null,
    source: "from-part",
    folder: "docs",
    defaultName: "test_plan",
  },
  {
    id: "instructions",
    discipline: "Documents",
    label: "Assembly instructions",
    description: "Step-by-step build instructions with the parts each step needs.",
    skill: null,
    source: "from-part",
    folder: "docs",
    defaultName: "assembly_instructions",
  },
];

/** Documents a product team writes, as Studio offers them: each section the agent fills, in order. */
export const DOCUMENT_TEMPLATES: ReadonlyArray<NewTemplate> = [
  {
    id: "prd",
    discipline: "Documents",
    label: "Product requirements (PRD)",
    description: "What the product must do and for whom, with measurable targets.",
    skill: null,
    source: "new",
    folder: "docs",
    defaultName: "PRD",
    outline: [
      "Summary",
      "The problem and who has it",
      "Users and use cases",
      "Requirements, each measurable, as must, should and could",
      "Performance targets: loads, life, temperatures, cycles",
      "Size, weight and interfaces",
      "Safety and regulations",
      "Cost target and volumes",
      "How success is measured",
      "Out of scope",
      "Milestones",
      "Open questions",
    ],
  },
  {
    id: "mrd",
    discipline: "Documents",
    label: "Market requirements (MRD)",
    description: "Who buys it, what they pay for, and what it competes with.",
    skill: null,
    source: "new",
    folder: "docs",
    defaultName: "MRD",
    outline: [
      "The market and the segment",
      "Customer needs and pains",
      "Competing products, with their prices",
      "Price point and volumes",
      "Channels",
      "Positioning",
      "Risks",
      "Open questions",
    ],
  },
  {
    id: "requirements",
    discipline: "Documents",
    label: "Engineering requirements",
    description: "Each requirement with a target, a tolerance and how it is verified.",
    skill: null,
    source: "new",
    folder: "docs",
    defaultName: "Engineering requirements",
    outline: [
      "A table of requirements: ID, requirement, target and tolerance, where it comes from (the PRD's line), how it is verified (analysis, test or inspection), and its status",
      "Interfaces",
      "Environment",
      "Standards",
      "Open questions",
    ],
  },
  {
    id: "fmea",
    discipline: "Documents",
    label: "FMEA",
    description: "Failure modes and effects, ranked by risk, with what to do about each.",
    skill: null,
    source: "new",
    folder: "docs",
    defaultName: "FMEA",
    outline: [
      "A table: item and function, failure mode, effect, severity (1 to 10), cause, occurrence (1 to 10), current controls, detection (1 to 10), risk priority number, recommended action",
      "The highest risks, and what to do first",
    ],
  },
  {
    id: "design-review",
    discipline: "Documents",
    label: "Design review",
    description: "Where the design stands against its requirements, and what to decide.",
    skill: null,
    source: "new",
    folder: "docs",
    defaultName: "Design review",
    outline: [
      "Purpose of the review",
      "The design as it stands, with pictures of its parts",
      "Requirements met, and not met",
      "Check and simulation results",
      "Risks",
      "Decisions needed",
      "Actions, with owners",
    ],
  },
  {
    id: "de-risk-plan",
    discipline: "Documents",
    label: "De-risk plan",
    description: "The unknowns, and the experiments and test rigs that settle them.",
    skill: null,
    source: "new",
    folder: "docs",
    defaultName: "De-risk plan",
    outline: [
      "The unknowns, riskiest first",
      "For each: the experiment or characterization rig that settles it",
      "What result counts as settled",
      "What it needs, and how long it takes",
      "Order of work",
    ],
  },
];

/** The templates the enabled plugins' skills can do, in their order, documents after the rest. */
export function availableTemplates(skills: ReadonlySet<string>): NewTemplate[] {
  return [...NEW_TEMPLATES, ...DOCUMENT_TEMPLATES].filter(
    (template) => template.skill === null || skills.has(template.skill),
  );
}

/** Whether a template writes a document of its own (a built-in one's sections, or a file to follow). */
export const isDocumentTemplate = (template: NewTemplate) =>
  template.outline !== undefined || template.file !== undefined;

/** A built-in document as a sentence names it. */
const DOCUMENT_NOUNS: Readonly<Record<string, string>> = {
  prd: "product requirements document (PRD)",
  mrd: "market requirements document (MRD)",
  requirements: "engineering requirements document",
  fmea: "FMEA (failure modes and effects analysis)",
  "design-review": "design review",
  "de-risk-plan": "de-risk plan",
};

/** How the agent is told to fill a document: from what the project holds, guessing nothing. */
const FILL =
  "Fill each from the project's brief, its parts, their checks and the decisions in its README; write what is not known yet as an open question, not a guess.";

/** A file name the agent can use as is: lowercase words joined by underscores. */
export function fileStem(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "untitled"
  );
}

export interface NewWork {
  readonly template: NewTemplate;
  readonly name: string;
  readonly folder: string;
  readonly units: "mm" | "in";
  /** For a `from-part` template: the part as the job names it, a link to its file. */
  readonly part: string | null;
  /** What the person wants, in their words. */
  readonly description: string;
  /** A template file as the composer links it (`serializeComposerFileLink`), for one of the person's own. */
  readonly templateLink?: string;
}

/** The job a new piece of work starts as, written for the agent. */
export function newWorkPrompt(work: NewWork): string {
  const { template } = work;
  const wants = work.description.trim();
  const ask = wants === "" ? "" : ` ${wants.replace(/[.\s]*$/, ".")}`;
  const folder = work.folder.trim().replace(/^\/+|\/+$/g, "") || template.folder;
  const target = `${folder}/${fileStem(work.name)}`;
  if (template.file !== undefined) {
    return `Write ${work.name.trim() || template.label} for this project as ${target}.md, following the template ${work.templateLink ?? template.file} section by section, in its order and with its headings. ${FILL}${ask}`;
  }
  if (template.outline !== undefined) {
    const noun = DOCUMENT_NOUNS[template.id] ?? template.label;
    return `Write the ${noun} for this project as ${target}.md, with these sections: ${template.outline.join("; ")}. ${FILL}${ask}`;
  }
  const part = work.part ?? "the part I choose";
  const units = work.units === "in" ? "inches" : "millimeters";
  switch (template.id) {
    case "part":
      return `Create a new part, ${target}, in ${units}.${ask}`;
    case "assembly":
      return `Create a new assembly, ${target}, in ${units}, using the project's parts where they fit.${ask}`;
    case "sheet-metal":
      return `Create a new sheet metal part, ${target}, in ${units}, with its flat pattern.${ask}`;
    case "board":
      return `Create a new KiCad board, ${target}, with its schematic.${ask}`;
    case "harness":
      return `Create a new wiring harness, ${target}, with its bill of materials.${ask}`;
    case "drawing":
      return `Make an engineering drawing of ${part} with its key dimensions and tolerances, in ${units}.${ask}`;
    case "strength-study":
      return `Run a strength study on ${part} under its working load. Ask me for the loads, supports and material you need, then tell me where it is weakest and what to change.${ask}`;
    case "cam-job":
      return `Plan a CAM job for ${part} and post its G-code. Ask me for the machine, stock, tools and workholding you need.${ask}`;
    case "print":
      return `Slice ${part} for FDM printing and check the G-code.${ask}`;
    case "cut-file":
      return `Make a cut-ready DXF of ${part} for laser or waterjet cutting.${ask}`;
    case "robot":
      return `Make a URDF for ${part} with its links, joints and limits.${ask}`;
    case "test-plan":
      return `Write a test plan for ${part} as ${folder}/${fileStem(work.name)}.md: what to test, how, and the pass criteria.${ask}`;
    case "instructions":
      return `Write assembly instructions for ${part} as ${folder}/${fileStem(work.name)}.md, step by step, with the parts each step needs.${ask}`;
    default:
      return `${template.label}: ${target}.${ask}`;
  }
}
