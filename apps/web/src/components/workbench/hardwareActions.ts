import type { STUDIO_PROCESSES } from "@t3tools/shared/studioProjects";

/**
 * Hardware first, code second (`brand.json` `"focus": "hardware"`). The
 * workbench groups a part's jobs the way CAD tools do: Evaluate (strength,
 * fit, weight), Manufacture by way of making it (a way's check and its outputs
 * together, the project's own way first), and Document. Each job is one the
 * agent already knows through one of text-to-cad's skills, offered only while
 * an enabled plugin has that skill and only on the kinds of file it applies
 * to. A pick writes the job into the composer, naming the part, to edit
 * before sending.
 */
export const HARDWARE_FOCUS = import.meta.env.VITE_APP_FOCUS === "hardware";

export type HardwareActionGroup = "Evaluate" | "Manufacture" | "Document";

/** How the project's parts are made, as its setup says (`STUDIO_PROCESSES`). */
export type MakingProcess = (typeof STUDIO_PROCESSES)[number];

/** A way of making things, as Manufacture groups its jobs: one per method the skills know. */
export interface MakingWay {
  readonly id:
    | "fdm"
    | "resin"
    | "powder"
    | "metal-print"
    | "cnc"
    | "sheet"
    | "cutting"
    | "molding"
    | "board"
    | "buy";
  readonly title: string;
  /** The setup's processes that are this way; none for a way every project has. */
  readonly processes: ReadonlyArray<MakingProcess>;
}

/**
 * The methods, as text-to-cad's skills cover them: `dfam-check` for each way of printing (FDM,
 * SLA/DLP, SLS and MJF, metal powder bed), `dfm` for machining, sheet metal and molding, `gcode`,
 * `bambu-labs`, `cam`, `dxf` and `sendcutsend` for what each way makes.
 */
export const MAKING_WAYS: ReadonlyArray<MakingWay> = [
  { id: "fdm", title: "FDM printing", processes: ["3D printing (FDM)"] },
  { id: "resin", title: "Resin printing (SLA/DLP)", processes: ["3D printing (resin)"] },
  { id: "powder", title: "SLS and MJF printing", processes: ["3D printing (SLS)"] },
  { id: "metal-print", title: "Metal printing (SLM/DMLS)", processes: ["3D printing (metal)"] },
  { id: "cnc", title: "CNC machining", processes: ["CNC machining"] },
  { id: "sheet", title: "Sheet metal", processes: ["Sheet metal"] },
  { id: "cutting", title: "Laser and waterjet cutting", processes: ["Laser or waterjet cutting"] },
  { id: "molding", title: "Injection molding", processes: ["Injection molding"] },
  { id: "board", title: "Circuit board", processes: [] },
  { id: "buy", title: "Buy", processes: [] },
];

export interface HardwareAction {
  readonly id: string;
  readonly group: HardwareActionGroup;
  readonly label: string;
  /** The text-to-cad skill the job runs on; null for one any agent can do. */
  readonly skill: string | null;
  /** The part kinds it applies to, as the context strip names them (`describePart`); null for any. */
  readonly kinds: ReadonlyArray<string> | null;
  /** In Manufacture, the way of making it belongs to. */
  readonly way: MakingWay["id"] | null;
  /** It reads the part and reports, rather than making or writing something: starters lead with one. */
  readonly checks: boolean;
  /** The job, naming the part as given: a link to its file, which the composer shows as the part. */
  readonly prompt: (file: string) => string;
  /** The job as a starter names it, short: "Check bike hook for FDM printing". */
  readonly short: (name: string) => string;
}

const SOLID = ["Part", "Assembly"];
const PRINTABLE = ["Part", "Assembly", "Mesh"];

export const HARDWARE_ACTIONS: ReadonlyArray<HardwareAction> = [
  {
    id: "strength",
    group: "Evaluate",
    label: "Strength under load",
    skill: "fea",
    kinds: SOLID,
    way: null,
    checks: true,
    prompt: (file) =>
      `Check ${file} for strength under its working load. Ask me for the loads, supports and material you need, then tell me where it is weakest and what to change.`,
    short: (name) => `Check ${name} under load`,
  },
  {
    id: "fit",
    group: "Evaluate",
    label: "Fit and clearance",
    skill: "cad",
    kinds: ["Assembly"],
    way: null,
    checks: true,
    prompt: (file) =>
      `Check the parts in ${file} for collisions and tight clearances, and tell me where they touch or rub and by how much.`,
    short: (name) => `Check the fit of ${name}`,
  },
  {
    id: "mass",
    group: "Evaluate",
    label: "Weight and center of mass",
    skill: "cad",
    kinds: SOLID,
    way: null,
    checks: true,
    prompt: (file) =>
      `Tell me the weight, volume and center of mass of ${file} in the project's material, and what makes up most of the weight.`,
    short: (name) => `Weight of ${name}`,
  },
  {
    id: "fea-results",
    group: "Evaluate",
    label: "Explain these results",
    skill: "fea",
    kinds: ["FEA study"],
    way: null,
    checks: true,
    prompt: (file) =>
      `Walk me through the results in ${file} and tell me what fails, by how much, and what to change.`,
    short: (name) => `Explain the ${name} study`,
  },
  {
    id: "cam-results",
    group: "Evaluate",
    label: "Explain this job",
    skill: "cam",
    kinds: ["CAM job"],
    way: null,
    checks: true,
    prompt: (file) =>
      `Walk me through ${file} and tell me the cycle time, the tools, and anything to fix before cutting.`,
    short: (name) => `Explain the ${name} job`,
  },
  {
    id: "fdm",
    group: "Manufacture",
    label: "Check for FDM printing",
    skill: "dfam-check",
    kinds: PRINTABLE,
    way: "fdm",
    checks: true,
    prompt: (file) =>
      `Check ${file} for FDM printing: overhangs, thin walls, small holes, bridges and bed fit, and the best build orientation. Tell me what to change.`,
    short: (name) => `Check ${name} for FDM printing`,
  },
  {
    id: "slice",
    group: "Manufacture",
    label: "Slice for FDM",
    skill: "gcode",
    kinds: PRINTABLE,
    way: "fdm",
    checks: false,
    prompt: (file) => `Slice ${file} for FDM printing and check the G-code.`,
    short: (name) => `Slice ${name} for printing`,
  },
  {
    id: "bambu",
    group: "Manufacture",
    label: "Print on a Bambu printer",
    skill: "bambu-labs",
    kinds: PRINTABLE,
    way: "fdm",
    checks: false,
    prompt: (file) =>
      `Slice ${file} and get it ready on my Bambu printer. Check with me before the print starts.`,
    short: (name) => `Print ${name} on the Bambu`,
  },
  {
    id: "resin",
    group: "Manufacture",
    label: "Check for resin printing",
    skill: "dfam-check",
    kinds: PRINTABLE,
    way: "resin",
    checks: true,
    prompt: (file) =>
      `Check ${file} for resin (SLA/DLP) printing: supports, thin walls, small holes and fine features, and the best orientation. Tell me what to change.`,
    short: (name) => `Check ${name} for resin printing`,
  },
  {
    id: "sls",
    group: "Manufacture",
    label: "Check for SLS printing",
    skill: "dfam-check",
    kinds: PRINTABLE,
    way: "powder",
    checks: true,
    prompt: (file) =>
      `Check ${file} for SLS printing in PA12: wall thickness, small holes and features, and powder trapped inside. Tell me what to change.`,
    short: (name) => `Check ${name} for SLS printing`,
  },
  {
    id: "mjf",
    group: "Manufacture",
    label: "Check for MJF printing",
    skill: "dfam-check",
    kinds: PRINTABLE,
    way: "powder",
    checks: true,
    prompt: (file) =>
      `Check ${file} for MJF printing: wall thickness, small holes and features, and powder trapped inside. Tell me what to change.`,
    short: (name) => `Check ${name} for MJF printing`,
  },
  {
    id: "metal-print",
    group: "Manufacture",
    label: "Check for metal printing",
    skill: "dfam-check",
    kinds: PRINTABLE,
    way: "metal-print",
    checks: true,
    prompt: (file) =>
      `Check ${file} for metal powder bed printing (SLM/DMLS): overhangs and supports, thin walls, small holes and bridges, and the best orientation. Tell me what to change.`,
    short: (name) => `Check ${name} for metal printing`,
  },
  {
    id: "cnc",
    group: "Manufacture",
    label: "Check for CNC machining",
    skill: "dfm",
    kinds: SOLID,
    way: "cnc",
    checks: true,
    prompt: (file) =>
      `Check ${file} for CNC machining: tool access, internal corners, thin walls and setups. Tell me what to change.`,
    short: (name) => `Check ${name} for CNC machining`,
  },
  {
    id: "toolpaths",
    group: "Manufacture",
    label: "G-code for CNC",
    skill: "cam",
    kinds: ["Part"],
    way: "cnc",
    checks: false,
    prompt: (file) =>
      `Plan the toolpaths for ${file} and post its G-code. Ask me for the machine, stock, tools and workholding you need.`,
    short: (name) => `Post G-code for ${name}`,
  },
  {
    id: "sheet-metal",
    group: "Manufacture",
    label: "Check as sheet metal",
    skill: "dfm",
    kinds: ["Part"],
    way: "sheet",
    checks: true,
    prompt: (file) =>
      `Check ${file} as a sheet metal part: bend radii, reliefs, and hole and edge distances. Tell me what to change.`,
    short: (name) => `Check ${name} as sheet metal`,
  },
  {
    id: "flat-pattern",
    group: "Manufacture",
    label: "Flat pattern DXF",
    skill: "dxf",
    kinds: ["Part"],
    way: "sheet",
    checks: false,
    prompt: (file) =>
      `Make the flat pattern of ${file} as a DXF with its bend lines, ready to cut.`,
    short: (name) => `Flat pattern of ${name}`,
  },
  {
    id: "sendcutsend-sheet",
    group: "Manufacture",
    label: "Order from SendCutSend",
    skill: "sendcutsend",
    kinds: ["Part", "Drawing"],
    way: "sheet",
    checks: false,
    prompt: (file) =>
      `Check ${file} for a SendCutSend order with bending: material, thickness, bends and any other services it needs.`,
    short: (name) => `Get ${name} ready for SendCutSend`,
  },
  {
    id: "dxf",
    group: "Manufacture",
    label: "Cut-ready DXF",
    skill: "dxf",
    kinds: ["Part", "Drawing"],
    way: "cutting",
    checks: false,
    prompt: (file) => `Make a cut-ready DXF of ${file} for laser or waterjet cutting.`,
    short: (name) => `Make a cut file of ${name}`,
  },
  {
    id: "sendcutsend",
    group: "Manufacture",
    label: "Order from SendCutSend",
    skill: "sendcutsend",
    kinds: ["Part", "Drawing"],
    way: "cutting",
    checks: false,
    prompt: (file) =>
      `Check ${file} for a SendCutSend order: material, thickness and any services it needs.`,
    short: (name) => `Get ${name} ready for SendCutSend`,
  },
  {
    id: "molding",
    group: "Manufacture",
    label: "Check for injection molding",
    skill: "dfm",
    kinds: ["Part"],
    way: "molding",
    checks: true,
    prompt: (file) =>
      `Check ${file} for injection molding: draft, wall thickness and undercuts. Tell me what to change.`,
    short: (name) => `Check ${name} for injection molding`,
  },
  {
    id: "board-fab",
    group: "Manufacture",
    label: "Check for fabrication",
    skill: "pcb-dfm",
    kinds: ["Board"],
    way: "board",
    checks: true,
    prompt: (file) =>
      `Check ${file} against the fab's limits and tell me what to fix before ordering.`,
    short: (name) => `Check ${name} for fabrication`,
  },
  {
    id: "route",
    group: "Manufacture",
    label: "Route the board",
    skill: "pcb",
    kinds: ["Board"],
    way: "board",
    checks: false,
    prompt: (file) => `Route ${file} and run the board checks.`,
    short: (name) => `Route ${name}`,
  },
  {
    id: "standard-parts",
    group: "Manufacture",
    label: "Off-the-shelf parts",
    skill: "step-parts",
    kinds: SOLID,
    way: "buy",
    checks: false,
    prompt: (file) =>
      `Find the off-the-shelf parts ${file} needs, such as fasteners and bearings, with where to buy them, and import their STEP files.`,
    short: (name) => `Find standard parts for ${name}`,
  },
  {
    id: "drawing",
    group: "Document",
    label: "Engineering drawing",
    skill: "engineering-drawing",
    kinds: SOLID,
    way: null,
    checks: false,
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
    way: null,
    checks: false,
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
    way: null,
    checks: false,
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
    way: null,
    checks: false,
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
    way: null,
    checks: false,
    prompt: (file) => `Make a URDF for ${file} with its joints and limits.`,
    short: (name) => `Describe ${name} as a robot`,
  },
  {
    id: "write-up",
    group: "Document",
    label: "Write up the results",
    skill: null,
    kinds: null,
    way: null,
    checks: false,
    prompt: (file) =>
      `Round up what this thread did and found on ${file} in a short report in docs/: what was asked, what was done, the results with units, pictures of the results, the verdict, and what to do next.`,
    short: (name) => `Write up the results for ${name}`,
  },
];

const GROUPS: ReadonlyArray<HardwareActionGroup> = ["Evaluate", "Manufacture", "Document"];

/** A run of a menu's jobs, under its title (a way of making it) or none. */
export interface ActionSection {
  readonly title: string | null;
  readonly actions: ReadonlyArray<HardwareAction>;
}

export interface HardwareActionMenu {
  readonly group: HardwareActionGroup;
  /** In the menu itself: in Manufacture, the project's own way first, then buying and a board's own. */
  readonly sections: ReadonlyArray<ActionSection>;
  /** The other ways of making it, a submenu each; every way while the project hasn't chosen one. */
  readonly others: ReadonlyArray<ActionSection>;
  /** Whether the project has chosen how it is made, so the others are "other" ways. */
  readonly decided: boolean;
}

/**
 * The jobs for a part of this kind that the enabled plugins' skills can do, by menu, in order.
 * Manufacture puts the project's own way of making it first, whole, and the other ways apart.
 */
export function hardwareActions(
  kind: string,
  skills: ReadonlySet<string>,
  process: MakingProcess | string = "Not decided",
): HardwareActionMenu[] {
  const decided = process.trim() !== "" && process !== "Not decided";
  const own = MAKING_WAYS.find((way) => way.processes.some((entry) => entry === process)) ?? null;
  const offered = HARDWARE_ACTIONS.filter(
    (action) =>
      (action.kinds === null || action.kinds.includes(kind)) &&
      (action.skill === null || skills.has(action.skill)),
  );
  const inWay = (way: MakingWay): ActionSection => ({
    title: way.title,
    actions: offered.filter((action) => action.way === way.id),
  });
  return GROUPS.flatMap((group): HardwareActionMenu[] => {
    if (group !== "Manufacture") {
      const actions = offered.filter((action) => action.group === group);
      return actions.length === 0
        ? []
        : [{ group, sections: [{ title: null, actions }], others: [], decided }];
    }
    const sections = [
      ...(own === null ? [] : [inWay(own)]),
      ...MAKING_WAYS.filter((way) => way.processes.length === 0).map(inWay),
    ].filter((section) => section.actions.length > 0);
    const others = MAKING_WAYS.filter((way) => way.processes.length > 0 && way !== own)
      .map(inWay)
      .filter((section) => section.actions.length > 0);
    return sections.length === 0 && others.length === 0
      ? []
      : [{ group, sections, others, decided }];
  });
}
