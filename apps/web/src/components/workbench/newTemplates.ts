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

/** The templates the enabled plugins' skills can do, in their order. */
export function availableTemplates(skills: ReadonlySet<string>): NewTemplate[] {
  return NEW_TEMPLATES.filter((template) => template.skill === null || skills.has(template.skill));
}

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
  /** For a `from-part` template: the part's path in the project. */
  readonly part: string | null;
  /** What the person wants, in their words. */
  readonly description: string;
}

/** The job a new piece of work starts as, written for the agent. */
export function newWorkPrompt(work: NewWork): string {
  const { template } = work;
  const wants = work.description.trim();
  const ask = wants === "" ? "" : ` ${wants.replace(/[.\s]*$/, ".")}`;
  const folder = work.folder.trim().replace(/^\/+|\/+$/g, "") || template.folder;
  const target = `${folder}/${fileStem(work.name)}`;
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
      return `Run a strength study on ${part}. Ask me for the loads, supports and material you need, then tell me where it is weakest and what to change.${ask}`;
    case "cam-job":
      return `Plan a CAM job for ${part} and post its G-code. Ask me for the machine, stock, tools and workholding you need.${ask}`;
    case "print":
      return `Slice ${part} for FDM printing and check the G-code.${ask}`;
    case "cut-file":
      return `Make a cut-ready DXF of ${part} for laser or waterjet cutting.${ask}`;
    case "robot":
      return `Make a URDF for ${part}, with its links, joints and limits.${ask}`;
    case "test-plan":
      return `Write a test plan for ${part} as ${folder}/${fileStem(work.name)}.md: what to test, how, and the pass criteria.${ask}`;
    case "instructions":
      return `Write assembly instructions for ${part} as ${folder}/${fileStem(work.name)}.md, step by step, with the parts each step needs.${ask}`;
    default:
      return `${template.label}: ${target}.${ask}`;
  }
}
