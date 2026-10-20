import type { STUDIO_PROCESSES } from "@t3tools/shared/studioProjects";

/**
 * Hardware first, code second (`brand.json` `"focus": "hardware"`). The
 * workbench speaks a hardware engineer's verbs: check a part, make it,
 * document it. Each is a job the agent already knows through one of
 * text-to-cad's skills, offered only while an enabled plugin has that skill
 * and only on the kinds of file it applies to. A job that belongs to one way
 * of making things (printing, machining, sheet metal) leads when it is the
 * project's process and waits under the other ways when it is not. A pick
 * writes the job into the composer, naming the part, to edit before sending.
 */
export const HARDWARE_FOCUS = import.meta.env.VITE_APP_FOCUS === "hardware";

export type HardwareActionGroup = "Check" | "Make" | "Document";

/** How the project's parts are made, as its setup says (`STUDIO_PROCESSES`). */
export type MakingProcess = (typeof STUDIO_PROCESSES)[number];

export interface HardwareAction {
  readonly id: string;
  readonly group: HardwareActionGroup;
  readonly label: string;
  /** The text-to-cad skill the job runs on; null for one any agent can do. */
  readonly skill: string | null;
  /** The part kinds it applies to, as the context strip names them (`describePart`); null for any. */
  readonly kinds: ReadonlyArray<string> | null;
  /** The ways of making it is about; null when it holds whatever the process. */
  readonly processes: ReadonlyArray<MakingProcess> | null;
  /** The job, naming the part as given: a link to its file, which the composer shows as the part. */
  readonly prompt: (file: string) => string;
  /** The job as a starter names it, short: "Will bike hook print?". */
  readonly short: (name: string) => string;
}

const SOLID = ["Part", "Assembly"];
const PRINTABLE = ["Part", "Assembly", "Mesh"];
const PRINTING: ReadonlyArray<MakingProcess> = [
  "3D printing (FDM)",
  "3D printing (resin)",
  "3D printing (SLS)",
  "3D printing (metal)",
];
const CUT_FROM_SHEET: ReadonlyArray<MakingProcess> = ["Laser or waterjet cutting", "Sheet metal"];

export const HARDWARE_ACTIONS: ReadonlyArray<HardwareAction> = [
  {
    id: "printing",
    group: "Check",
    label: "Will it print?",
    skill: "dfam-check",
    kinds: PRINTABLE,
    processes: PRINTING,
    prompt: (file) =>
      `Check ${file} for 3D printing: overhangs, thin walls, bed fit and the best build orientation. Tell me what to change.`,
    short: (name) => `Will ${name} print?`,
  },
  {
    id: "cnc",
    group: "Check",
    label: "Will it machine?",
    skill: "dfm",
    kinds: SOLID,
    processes: ["CNC machining"],
    prompt: (file) =>
      `Check ${file} for CNC machining: tool access, internal corners, thin walls and setups. Tell me what to change.`,
    short: (name) => `Will ${name} machine?`,
  },
  {
    id: "sheet-metal",
    group: "Check",
    label: "Will it bend from sheet?",
    skill: "dfm",
    kinds: ["Part"],
    processes: ["Sheet metal"],
    prompt: (file) =>
      `Check ${file} as a sheet metal part: bend radii, reliefs, and hole and edge distances. Tell me what to change.`,
    short: (name) => `Will ${name} bend from sheet?`,
  },
  {
    id: "molding",
    group: "Check",
    label: "Will it mold?",
    skill: "dfm",
    kinds: ["Part"],
    processes: ["Injection molding"],
    prompt: (file) =>
      `Check ${file} for injection molding: draft, wall thickness and undercuts. Tell me what to change.`,
    short: (name) => `Will ${name} mold?`,
  },
  {
    id: "strength",
    group: "Check",
    label: "Is it strong enough?",
    skill: "fea",
    kinds: SOLID,
    processes: null,
    prompt: (file) =>
      `Check ${file} for strength under its working load. Ask me for the loads, supports and material you need, then tell me where it is weakest and what to change.`,
    short: (name) => `Is ${name} strong enough?`,
  },
  {
    id: "fit",
    group: "Check",
    label: "Do the parts fit?",
    skill: "cad",
    kinds: ["Assembly"],
    processes: null,
    prompt: (file) =>
      `Check the parts in ${file} for collisions and tight clearances, and tell me where they touch or rub and by how much.`,
    short: (name) => `Do ${name}'s parts fit?`,
  },
  {
    id: "mass",
    group: "Check",
    label: "Weight and center of mass",
    skill: "cad",
    kinds: SOLID,
    processes: null,
    prompt: (file) =>
      `Tell me the weight, volume and center of mass of ${file} in the project's material, and what makes up most of the weight.`,
    short: (name) => `Weigh ${name}`,
  },
  {
    id: "fea-results",
    group: "Check",
    label: "Explain these results",
    skill: "fea",
    kinds: ["FEA study"],
    processes: null,
    prompt: (file) =>
      `Walk me through the results in ${file} and tell me what fails, by how much, and what to change.`,
    short: (name) => `Explain the ${name} study`,
  },
  {
    id: "board-fab",
    group: "Check",
    label: "Ready for the fab?",
    skill: "pcb-dfm",
    kinds: ["Board"],
    processes: null,
    prompt: (file) =>
      `Check ${file} against the fab's limits and tell me what to fix before ordering.`,
    short: (name) => `Is ${name} ready for the fab?`,
  },
  {
    id: "cam-results",
    group: "Check",
    label: "Explain this job",
    skill: "cam",
    kinds: ["CAM job"],
    processes: null,
    prompt: (file) =>
      `Walk me through ${file} and tell me the cycle time, the tools, and anything to fix before cutting.`,
    short: (name) => `Explain the ${name} job`,
  },
  {
    id: "bambu",
    group: "Make",
    label: "Print it on my Bambu",
    skill: "bambu-labs",
    kinds: PRINTABLE,
    processes: ["3D printing (FDM)"],
    prompt: (file) =>
      `Slice ${file} and get it ready on my Bambu printer. Check with me before the print starts.`,
    short: (name) => `Print ${name} on the Bambu`,
  },
  {
    id: "slice",
    group: "Make",
    label: "Slice for my printer",
    skill: "gcode",
    kinds: PRINTABLE,
    processes: ["3D printing (FDM)"],
    prompt: (file) => `Slice ${file} for FDM printing and check the G-code.`,
    short: (name) => `Slice ${name} for printing`,
  },
  {
    id: "toolpaths",
    group: "Make",
    label: "Toolpaths and G-code",
    skill: "cam",
    kinds: ["Part"],
    processes: ["CNC machining"],
    prompt: (file) =>
      `Plan the toolpaths for ${file} and post its G-code. Ask me for the machine, stock, tools and workholding you need.`,
    short: (name) => `Toolpaths for ${name}`,
  },
  {
    id: "dxf",
    group: "Make",
    label: "Laser or waterjet cut file",
    skill: "dxf",
    kinds: ["Part", "Drawing"],
    processes: CUT_FROM_SHEET,
    prompt: (file) => `Make a cut-ready DXF of ${file} for laser or waterjet cutting.`,
    short: (name) => `Make a cut file of ${name}`,
  },
  {
    id: "sendcutsend",
    group: "Make",
    label: "Order from SendCutSend",
    skill: "sendcutsend",
    kinds: ["Part", "Drawing"],
    processes: CUT_FROM_SHEET,
    prompt: (file) =>
      `Check ${file} for a SendCutSend order: material, thickness and any services it needs.`,
    short: (name) => `Get ${name} ready for SendCutSend`,
  },
  {
    id: "standard-parts",
    group: "Make",
    label: "Find the off-the-shelf parts",
    skill: "step-parts",
    kinds: SOLID,
    processes: null,
    prompt: (file) =>
      `Find the off-the-shelf parts ${file} needs, such as fasteners and bearings, with where to buy them, and import their STEP files.`,
    short: (name) => `Find standard parts for ${name}`,
  },
  {
    id: "route",
    group: "Make",
    label: "Route the board",
    skill: "pcb",
    kinds: ["Board"],
    processes: null,
    prompt: (file) => `Route ${file} and run the board checks.`,
    short: (name) => `Route ${name}`,
  },
  {
    id: "drawing",
    group: "Document",
    label: "Drawing with dimensions",
    skill: "engineering-drawing",
    kinds: SOLID,
    processes: null,
    prompt: (file) =>
      `Make an engineering drawing of ${file} with its key dimensions and tolerances.`,
    short: (name) => `Draw ${name}`,
  },
  {
    id: "parts-list",
    group: "Document",
    label: "Parts list",
    skill: null,
    kinds: ["Assembly"],
    processes: null,
    prompt: (file) =>
      `Make a parts list for ${file} in docs/: each part, how many, its material, and how it is made or where to buy it.`,
    short: (name) => `Parts list for ${name}`,
  },
  {
    id: "instructions",
    group: "Document",
    label: "Assembly instructions",
    skill: null,
    kinds: ["Assembly"],
    processes: null,
    prompt: (file) =>
      `Write assembly instructions for ${file} in docs/, step by step, with the parts and tools each step needs.`,
    short: (name) => `Assembly instructions for ${name}`,
  },
  {
    id: "test-plan",
    group: "Document",
    label: "Test plan",
    skill: null,
    kinds: SOLID,
    processes: null,
    prompt: (file) =>
      `Write a test plan for ${file} in docs/: what to test, how, and the pass criteria.`,
    short: (name) => `Test plan for ${name}`,
  },
  {
    id: "urdf",
    group: "Document",
    label: "Robot description (URDF)",
    skill: "urdf",
    kinds: ["Assembly"],
    processes: null,
    prompt: (file) => `Make a URDF for ${file} with its joints and limits.`,
    short: (name) => `Describe ${name} as a robot`,
  },
  {
    id: "write-up",
    group: "Document",
    label: "Write up what we did",
    skill: null,
    kinds: null,
    processes: null,
    prompt: (file) =>
      `Round up what this thread did and found on ${file} in a short report in docs/: what was asked, what was done, the results with units, pictures of the results, the verdict, and what to do next.`,
    short: (name) => `Write up the results for ${name}`,
  },
];

const GROUPS: ReadonlyArray<HardwareActionGroup> = ["Check", "Make", "Document"];

export interface HardwareActionMenu {
  readonly group: HardwareActionGroup;
  /** The jobs for this project: its own way of making first, then those that hold for any. */
  readonly actions: ReadonlyArray<HardwareAction>;
  /** Jobs for other ways of making it, or for every way while the project hasn't chosen one. */
  readonly others: ReadonlyArray<HardwareAction>;
}

/**
 * The jobs for a part of this kind that the enabled plugins' skills can do, by group, in order.
 * With the project's process chosen, the jobs for it lead and the rest of the ways to make it
 * follow apart; until it is chosen, every way to make it waits apart.
 */
export function hardwareActions(
  kind: string,
  skills: ReadonlySet<string>,
  process: MakingProcess | string = "Not decided",
): HardwareActionMenu[] {
  const decided = process !== "Not decided" && process.trim() !== "";
  const ours = (action: HardwareAction) =>
    action.processes !== null && action.processes.some((entry) => entry === process);
  return GROUPS.flatMap((group) => {
    const offered = HARDWARE_ACTIONS.filter(
      (action) =>
        action.group === group &&
        (action.kinds === null || action.kinds.includes(kind)) &&
        (action.skill === null || skills.has(action.skill)),
    );
    const actions = [
      ...offered.filter((action) => decided && ours(action)),
      ...offered.filter((action) => action.processes === null),
    ];
    const others = offered.filter(
      (action) => action.processes !== null && !(decided && ours(action)),
    );
    return actions.length === 0 && others.length === 0 ? [] : [{ group, actions, others }];
  });
}
