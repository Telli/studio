import type { STUDIO_PROCESSES } from "@t3tools/shared/studioProjects";

/**
 * Hardware first, code second (`brand.json` `"focus": "hardware"`). The
 * workbench groups a part's jobs the way CAD tools do: Evaluate (simulations,
 * fit, motion, mass), Manufacture by way of making it (a way's check and its
 * outputs together, the project's own way first), and Document. Each menu
 * keeps its everyday jobs in titled sections and the rest in a submenu each.
 * Every job is one the agent already knows through one of text-to-cad's
 * skills, offered only while an enabled plugin has that skill and only on the
 * kinds of file it applies to. A pick writes the job into the composer,
 * naming the part, to edit before sending.
 */
export const HARDWARE_FOCUS = import.meta.env.VITE_APP_FOCUS === "hardware";

export type HardwareActionGroup = "Evaluate" | "Manufacture" | "Document";

/** How the project's parts are made, as its setup says (`STUDIO_PROCESSES`). */
export type MakingProcess = (typeof STUDIO_PROCESSES)[number];

/** A section of a menu's jobs. */
export interface ActionSectionDef {
  readonly id: string;
  readonly group: HardwareActionGroup;
  readonly title: string;
  /** In Manufacture, the setup's processes this way of making is: the project's own leads. */
  readonly processes?: ReadonlyArray<MakingProcess>;
  /** Kept in a submenu under the menu's "more" heading, not in the menu itself. */
  readonly more?: boolean;
}

/**
 * The sections, as text-to-cad's skills cover the work: `fea` for every simulation, `cad` for fit,
 * motion, mass, pictures and video and for exporting STEP, STL and 3MF, `dfam-check` for each way of printing (FDM, SLA/DLP, SLS and
 * MJF, metal powder bed), `dfm` for machining, sheet metal and molding, `pcb` and `pcb-dfm` for
 * boards, and `urdf`, `sdf` and `srdf` for robot descriptions.
 */
export const ACTION_SECTIONS: ReadonlyArray<ActionSectionDef> = [
  { id: "simulation", group: "Evaluate", title: "Simulation" },
  { id: "fit-mass", group: "Evaluate", title: "Fit, motion and mass" },
  { id: "results", group: "Evaluate", title: "Results" },
  { id: "strength", group: "Evaluate", title: "Strength and durability", more: true },
  { id: "vibration", group: "Evaluate", title: "Vibration, shock and sound", more: true },
  { id: "heat", group: "Evaluate", title: "Heat", more: true },
  { id: "flow", group: "Evaluate", title: "Flow", more: true },
  { id: "electrical", group: "Evaluate", title: "Electrical", more: true },
  { id: "fdm", group: "Manufacture", title: "FDM printing", processes: ["3D printing (FDM)"] },
  {
    id: "resin",
    group: "Manufacture",
    title: "Resin printing (SLA/DLP)",
    processes: ["3D printing (resin)"],
  },
  {
    id: "powder",
    group: "Manufacture",
    title: "SLS and MJF printing",
    processes: ["3D printing (SLS)"],
  },
  {
    id: "metal-print",
    group: "Manufacture",
    title: "Metal printing (SLM/DMLS)",
    processes: ["3D printing (metal)"],
  },
  { id: "cnc", group: "Manufacture", title: "CNC machining", processes: ["CNC machining"] },
  { id: "sheet", group: "Manufacture", title: "Sheet metal", processes: ["Sheet metal"] },
  {
    id: "cutting",
    group: "Manufacture",
    title: "Laser and waterjet cutting",
    processes: ["Laser or waterjet cutting"],
  },
  {
    id: "molding",
    group: "Manufacture",
    title: "Injection molding",
    processes: ["Injection molding"],
  },
  { id: "board", group: "Manufacture", title: "Circuit board" },
  { id: "buy", group: "Manufacture", title: "Buy" },
  { id: "export", group: "Manufacture", title: "Export files" },
  { id: "drawings", group: "Document", title: "Drawings" },
  { id: "building", group: "Document", title: "Building it" },
  { id: "pictures", group: "Document", title: "Pictures and video" },
  { id: "reports", group: "Document", title: "Reports" },
  { id: "robot", group: "Document", title: "Robot description", more: true },
];

export interface HardwareAction {
  readonly id: string;
  readonly group: HardwareActionGroup;
  /** Its section (`ACTION_SECTIONS`). */
  readonly section: string;
  readonly label: string;
  /**
   * What you get: what its skill makes, one line under the label in its menu, in the voice of its
   * library entry's "You get" (`libraryCatalog.ts`). A sentence of at most 90 characters.
   */
  readonly gets: string;
  /** The text-to-cad skill the job runs on; null for one any agent can do. */
  readonly skill: string | null;
  /** The part kinds it applies to, as the context strip names them (`describePart`); null for any. */
  readonly kinds: ReadonlyArray<string> | null;
  /** It reads the part and reports, rather than making or writing something: starters lead with one. */
  readonly checks: boolean;
  /** The job, naming the part as given: a link to its file, which the composer shows as the part. */
  readonly prompt: (file: string) => string;
  /** The job as a starter names it, short: "Check bike hook for FDM printing". */
  readonly short: (name: string) => string;
}

const SOLID = ["Part", "Assembly"];
const PRINTABLE = ["Part", "Assembly", "Mesh"];

/**
 * A simulation the `fea` skill runs on a part or an assembly. It makes a study with `result`, what
 * that analysis reports: "its natural frequencies and mode shapes".
 */
const study = (
  id: string,
  section: string,
  label: string,
  result: string,
  prompt: (file: string) => string,
  kinds: ReadonlyArray<string> = SOLID,
): HardwareAction => ({
  id,
  group: "Evaluate",
  section,
  label,
  gets: `A study with ${result}.`,
  skill: "fea",
  kinds,
  checks: true,
  prompt,
  short: (name) => `${label} of ${name}`,
});

/** A printability check by the `dfam-check` skill. */
const printCheck = (
  id: string,
  section: string,
  method: string,
  looks: string,
): HardwareAction => ({
  id,
  group: "Manufacture",
  section,
  label: `Check for ${method}`,
  gets: `Findings for ${method}, each passing, to fix or to check, with the fix.`,
  skill: "dfam-check",
  kinds: PRINTABLE,
  checks: true,
  prompt: (file) => `Check ${file} for ${method}: ${looks}. Tell me what to change.`,
  short: (name) => `Check ${name} for ${method}`,
});

export const HARDWARE_ACTIONS: ReadonlyArray<HardwareAction> = [
  {
    id: "strength",
    group: "Evaluate",
    section: "simulation",
    label: "Strength under load",
    gets: "A study with the stress plot, the peak stress, the safety factor and a pass or fail.",
    skill: "fea",
    kinds: SOLID,
    checks: true,
    prompt: (file) =>
      `Check ${file} for strength under its working load. Ask me for the loads, supports and material you need, then tell me where it is weakest and what to change.`,
    short: (name) => `Check ${name} under load`,
  },
  study(
    "vibration",
    "simulation",
    "Vibration",
    "its natural frequencies and mode shapes",
    (file) =>
      `Find the natural frequencies and mode shapes of ${file}, and tell me whether anything it will see could make it resonate.`,
  ),
  study(
    "drop",
    "simulation",
    "Drop test",
    "an estimate of the peak stress and safety factor in the drop",
    (file) =>
      `Estimate what happens if ${file} is dropped: where it is most stressed and whether it breaks. Ask me for the height and what it lands on.`,
  ),
  study(
    "topology",
    "simulation",
    "Make it lighter",
    "the lighter shape as an STL to rebuild, and the mass it saves",
    (file) =>
      `Find where material can come out of ${file} while it still holds its load, and show me the shape to rebuild. Ask me for the loads, supports and how much lighter.`,
    ["Part"],
  ),
  {
    id: "fit",
    group: "Evaluate",
    section: "fit-mass",
    label: "Fit and clearance",
    gets: "A report of any collision, where the parts touch and the tightest gaps.",
    skill: "cad",
    kinds: ["Assembly"],
    checks: true,
    prompt: (file) =>
      `Check the parts in ${file} for collisions and tight clearances, and tell me where they touch or rub and by how much.`,
    short: (name) => `Check the fit of ${name}`,
  },
  {
    id: "motion",
    group: "Evaluate",
    section: "fit-mass",
    label: "Range of motion",
    gets: "A report of the closest gap and any collision at each step of its travel.",
    skill: "cad",
    kinds: ["Assembly"],
    checks: true,
    prompt: (file) =>
      `Move ${file} through its range of motion and tell me where parts collide, bind or run out of travel.`,
    short: (name) => `Range of motion of ${name}`,
  },
  {
    id: "mass",
    group: "Evaluate",
    section: "fit-mass",
    label: "Weight and center of mass",
    gets: "The weight, volume and center of mass in the project's material, and what weighs most.",
    skill: "cad",
    kinds: SOLID,
    checks: true,
    prompt: (file) =>
      `Tell me the weight, volume and center of mass of ${file} in the project's material, and what makes up most of the weight.`,
    short: (name) => `Weight of ${name}`,
  },
  {
    id: "fea-results",
    group: "Evaluate",
    section: "results",
    label: "Explain these results",
    gets: "A walk through the results: what fails, by how much, and what to change.",
    skill: "fea",
    kinds: ["FEA study"],
    checks: true,
    prompt: (file) =>
      `Walk me through the results in ${file} and tell me what fails, by how much, and what to change.`,
    short: (name) => `Explain the ${name} study`,
  },
  {
    id: "cam-results",
    group: "Evaluate",
    section: "results",
    label: "Explain this job",
    gets: "A walk through the job: its cycle time, its tools and what to fix before cutting.",
    skill: "cam",
    kinds: ["CAM job"],
    checks: true,
    prompt: (file) =>
      `Walk me through ${file} and tell me the cycle time, the tools, and anything to fix before cutting.`,
    short: (name) => `Explain the ${name} job`,
  },
  study(
    "buckling",
    "strength",
    "Buckling",
    "the buckling load, its safety factor and the shape it buckles in",
    (file) =>
      `Check whether ${file} buckles under its load: the buckling load and the safety factor. Ask me for the loads and supports.`,
  ),
  study(
    "fatigue",
    "strength",
    "Fatigue life",
    "how many load cycles it lasts, against the cycles it needs",
    (file) =>
      `Estimate the fatigue life of ${file}: how many load cycles before it cracks. Ask me for the load and how often it repeats.`,
  ),
  study(
    "nonlinear",
    "strength",
    "Permanent bend",
    "whether it carries the load or gives way, and its permanent strain",
    (file) =>
      `Check whether ${file} bends for good under its load, and at what load it gives way. Ask me for the load and material.`,
  ),
  study(
    "creep",
    "strength",
    "Creep",
    "the creep strain and sag over time, and whether it holds",
    (file) =>
      `Check whether ${file} slowly sags or stretches under a load held for a long time. Ask me for the load, the temperature and how long.`,
  ),
  study(
    "fracture",
    "strength",
    "Crack growth",
    "whether the crack grows, and how big a crack it can take",
    (file) =>
      `Check whether a crack in ${file} would grow, and how big a crack it can take. Ask me where the crack is and the load.`,
  ),
  study(
    "bolt",
    "strength",
    "Bolted joints",
    "each bolt's load, and whether the joint holds, opens or slips",
    (file) =>
      `Check the bolted joints in ${file}: whether the bolts hold, whether the joint opens or slips, and the tightening torque. Ask me for the bolts and loads.`,
    ["Assembly"],
  ),
  study(
    "contact",
    "strength",
    "Parts pressing together",
    "how hard the parts press on each other, and where",
    (file) =>
      `Check how hard the parts of ${file} press on each other, and where, under its load. Ask me for the load.`,
    ["Assembly"],
  ),
  study(
    "composite",
    "strength",
    "Composite layup",
    "which ply fails first, and how close it comes to failing",
    (file) =>
      `Check the fibre layup of ${file}: which ply fails first and the safety factor. Ask me for the layup and loads.`,
  ),
  study(
    "harmonic",
    "vibration",
    "Shaking (sine sweep)",
    "where it resonates, how much it moves and the stress it sees",
    (file) =>
      `Shake ${file} across a frequency range, as on a shaker or by a motor, and tell me where it responds most and the stress it sees. Ask me for the range and level.`,
  ),
  study(
    "random-vibration",
    "vibration",
    "Random vibration",
    "the stress it sees at 3σ, and its safety factor",
    (file) =>
      `Check ${file} against a random vibration spec: the stress it sees and whether it lasts. Ask me for the spec in g²/Hz.`,
  ),
  study(
    "shock",
    "vibration",
    "Shock",
    "the peak stress in the shock, its safety factor and peak movement",
    (file) =>
      `Check ${file} against a shock spec: the peak stress and whether it survives. Ask me for the shock.`,
  ),
  study(
    "impact",
    "vibration",
    "Drop impact (detailed)",
    "the impact over time: the peak g, the peak stress and the safety factor",
    (file) =>
      `Run a detailed drop of ${file} onto a rigid floor, and tell me where it is most stressed and whether it breaks. Ask me for the drop.`,
  ),
  study(
    "transient",
    "vibration",
    "Load over time",
    "the peak stress, when it comes and the safety factor",
    (file) =>
      `Check ${file} under a load that changes over time, such as a hammer blow, and tell me the peak stress and when it comes. Ask me for the load over time.`,
  ),
  study(
    "rotor",
    "vibration",
    "Spinning parts",
    "the critical speeds, the unbalance response and the spinning stress",
    (file) =>
      `Check the spinning shaft or rotor in ${file}: its critical speeds, its response to unbalance and its spinning stress. Ask me for the speed range and bearings.`,
  ),
  study(
    "acoustic",
    "vibration",
    "Sound",
    "how loud it is in dB, or the frequencies its cavity booms at",
    (file) =>
      `Find how loud ${file} is, or the frequencies its cavity booms at. Ask me for the source of the sound.`,
  ),
  study(
    "thermal",
    "heat",
    "How hot it gets",
    "the hottest spot and the temperatures across it",
    (file) =>
      `Find how hot ${file} gets when it runs steadily: the hottest spot and the temperatures across it. Ask me for the heat sources and cooling.`,
  ),
  study(
    "thermal-transient",
    "heat",
    "Heat over time",
    "the temperatures over time, the hottest moment and where",
    (file) =>
      `Find how ${file} heats up through a warm-up or a duty cycle. Ask me for the heat over time and the cooling.`,
  ),
  study(
    "thermal-stress",
    "heat",
    "Heat stress",
    "the stress the heat causes, how far it warps and the safety factor",
    (file) => `Check whether heating ${file} stresses or warps it. Ask me for the temperatures.`,
  ),
  study(
    "conjugate-heat",
    "heat",
    "Cooling by a flow",
    "how hot the part runs and how warm the coolant comes out",
    (file) =>
      `Find how hot ${file} runs with its coolant flowing, and how warm the coolant comes out. Ask me for the flow and the heat.`,
  ),
  study(
    "cfd",
    "flow",
    "Flow through or around it",
    "the pressure drop and the push of the air or water on it",
    (file) =>
      `Simulate the flow through or around ${file}: the pressure drop and the push of the air or water on it. Ask me for the fluid and the speed.`,
  ),
  study(
    "cfd-turbulent",
    "flow",
    "Fast flow (turbulent)",
    "the pressure drop and the forces in the fast, turbulent flow",
    (file) =>
      `Simulate the fast, turbulent flow through or around ${file}: the pressure drop and the forces. Ask me for the fluid and the speed.`,
  ),
  study(
    "cfd-compressible",
    "flow",
    "Fast gas flow",
    "the Mach number, whether it chokes and where any shock sits",
    (file) =>
      `Simulate the fast gas flow through ${file}: whether it chokes, the Mach number and where any shock sits. Ask me for the gas and pressures.`,
  ),
  study(
    "fsi",
    "flow",
    "Flow and bending",
    "how far the flow bends it, its stress and how the bend changes the flow",
    (file) =>
      `Check whether the flow bends ${file}, and how the bend changes the flow. Ask me for the fluid and the speed.`,
  ),
  study(
    "multiphase",
    "flow",
    "Sloshing liquid",
    "how high the liquid climbs and the force on the walls",
    (file) =>
      `Check how the liquid inside ${file} moves when it is shaken or braked: how high it climbs and the force on the walls. Ask me for the motion.`,
  ),
  study(
    "electromagnetic",
    "electrical",
    "Magnetic and electric fields",
    "the field and its forces, inductance, capacitance or heating",
    (file) =>
      `Simulate the magnetic or electric field in ${file}: forces, inductance, capacitance or heating from current. Ask me for the currents or voltages.`,
  ),
  study(
    "piezo",
    "electrical",
    "Piezo",
    "how far it moves at a voltage, its force and its resonance",
    (file) =>
      `Simulate the piezo element in ${file}: how far it moves at a voltage, the force, and its resonance. Ask me for the drive.`,
  ),
  printCheck(
    "fdm",
    "fdm",
    "FDM printing",
    "overhangs, thin walls, small holes, bridges and bed fit, and the best build orientation",
  ),
  {
    id: "slice",
    group: "Manufacture",
    section: "fdm",
    label: "Slice for FDM",
    gets: "Sliced G-code from OrcaSlicer, checked against your printer and filament.",
    skill: "gcode",
    kinds: PRINTABLE,
    checks: false,
    prompt: (file) => `Slice ${file} for FDM printing and check the G-code.`,
    short: (name) => `Slice ${name} for printing`,
  },
  {
    id: "bambu",
    group: "Manufacture",
    section: "fdm",
    label: "Print on a Bambu printer",
    gets: "The print opened in Bambu Connect or Bambu Studio, for you to check and start.",
    skill: "bambu-labs",
    kinds: PRINTABLE,
    checks: false,
    prompt: (file) =>
      `Slice ${file} and get it ready on my Bambu printer. Check with me before the print starts.`,
    short: (name) => `Print ${name} on the Bambu`,
  },
  printCheck(
    "resin",
    "resin",
    "resin printing",
    "supports, thin walls, small holes and fine features, and the best orientation",
  ),
  printCheck(
    "sls",
    "powder",
    "SLS printing",
    "wall thickness, small holes and features, and powder trapped inside",
  ),
  printCheck(
    "mjf",
    "powder",
    "MJF printing",
    "wall thickness, small holes and features, and powder trapped inside",
  ),
  printCheck(
    "metal-print",
    "metal-print",
    "metal printing",
    "overhangs and supports, thin walls, small holes and bridges, and the best orientation",
  ),
  {
    id: "cnc",
    group: "Manufacture",
    section: "cnc",
    label: "Check for CNC machining",
    gets: "Findings for CNC machining, each passing, to fix or to check, with the fix.",
    skill: "dfm",
    kinds: SOLID,
    checks: true,
    prompt: (file) =>
      `Check ${file} for CNC machining: tool access, internal corners, thin walls and setups. Tell me what to change.`,
    short: (name) => `Check ${name} for CNC machining`,
  },
  {
    id: "toolpaths",
    group: "Manufacture",
    section: "cnc",
    label: "G-code for CNC",
    gets: "G-code for each setup, and its toolpaths to look over before cutting.",
    skill: "cam",
    kinds: ["Part"],
    checks: false,
    prompt: (file) =>
      `Plan the toolpaths for ${file} and post its G-code. Ask me for the machine, stock, tools and workholding you need.`,
    short: (name) => `Post G-code for ${name}`,
  },
  {
    id: "sheet-metal",
    group: "Manufacture",
    section: "sheet",
    label: "Check as sheet metal",
    gets: "Findings for sheet metal, each passing, to fix or to check, with the fix.",
    skill: "dfm",
    kinds: ["Part"],
    checks: true,
    prompt: (file) =>
      `Check ${file} as a sheet metal part: bend radii, reliefs, and hole and edge distances. Tell me what to change.`,
    short: (name) => `Check ${name} as sheet metal`,
  },
  {
    id: "flat-pattern",
    group: "Manufacture",
    section: "sheet",
    label: "Flat pattern DXF",
    gets: "The flat pattern as a DXF, its bend lines on a layer of their own.",
    skill: "dxf",
    kinds: ["Part"],
    checks: false,
    prompt: (file) =>
      `Make the flat pattern of ${file} as a DXF with its bend lines, ready to cut.`,
    short: (name) => `Flat pattern of ${name}`,
  },
  {
    id: "sendcutsend-sheet",
    group: "Manufacture",
    section: "sheet",
    label: "Order from SendCutSend",
    gets: "A preflight against SendCutSend's rules, bends included. Nothing is uploaded or ordered.",
    skill: "sendcutsend",
    kinds: ["Part", "Drawing"],
    checks: false,
    prompt: (file) =>
      `Check ${file} for a SendCutSend order with bending: material, thickness, bends and any other services it needs.`,
    short: (name) => `Get ${name} ready for SendCutSend`,
  },
  {
    id: "dxf",
    group: "Manufacture",
    section: "cutting",
    label: "Cut-ready DXF",
    gets: "A DXF of the outline and holes to cut, each cut closed and drawn once.",
    skill: "dxf",
    kinds: ["Part", "Drawing"],
    checks: false,
    prompt: (file) => `Make a cut-ready DXF of ${file} for laser or waterjet cutting.`,
    short: (name) => `Make a cut file of ${name}`,
  },
  {
    id: "sendcutsend",
    group: "Manufacture",
    section: "cutting",
    label: "Order from SendCutSend",
    gets: "A preflight against SendCutSend's rules for cutting. Nothing is uploaded or ordered.",
    skill: "sendcutsend",
    kinds: ["Part", "Drawing"],
    checks: false,
    prompt: (file) =>
      `Check ${file} for a SendCutSend order: material, thickness and any services it needs.`,
    short: (name) => `Get ${name} ready for SendCutSend`,
  },
  {
    id: "molding",
    group: "Manufacture",
    section: "molding",
    label: "Check for injection molding",
    gets: "Findings for injection molding, each passing, to fix or to check, with the fix.",
    skill: "dfm",
    kinds: ["Part"],
    checks: true,
    prompt: (file) =>
      `Check ${file} for injection molding: draft, wall thickness and undercuts. Tell me what to change.`,
    short: (name) => `Check ${name} for injection molding`,
  },
  {
    id: "board-fab",
    group: "Manufacture",
    section: "board",
    label: "Check for fabrication",
    gets: "Findings for fabrication, each passing, to fix or to check, with the fix.",
    skill: "pcb-dfm",
    kinds: ["Board"],
    checks: true,
    prompt: (file) =>
      `Check ${file} against the fab's limits and tell me what to fix before ordering.`,
    short: (name) => `Check ${name} for fabrication`,
  },
  {
    id: "board-assembly",
    group: "Manufacture",
    section: "board",
    label: "Check for assembly",
    gets: "Findings for assembly, each passing, to fix or to check, with the fix.",
    skill: "pcb-dfm",
    kinds: ["Board"],
    checks: true,
    prompt: (file) =>
      `Check ${file} for assembly: parts sourcing (LCSC or MPN), footprints, polarity, fiducials and placement. Tell me what to fix before ordering.`,
    short: (name) => `Check ${name} for assembly`,
  },
  {
    id: "route",
    group: "Manufacture",
    section: "board",
    label: "Route the board",
    gets: "The routed board, with what its design rule check and board checks found.",
    skill: "pcb",
    kinds: ["Board"],
    checks: false,
    prompt: (file) => `Route ${file} and run the board checks.`,
    short: (name) => `Route ${name}`,
  },
  {
    id: "gerbers",
    group: "Manufacture",
    section: "board",
    label: "Gerbers and drill files",
    gets: "Gerber and drill files for the fab, once the board passes its design rule check.",
    skill: "pcb",
    kinds: ["Board"],
    checks: false,
    prompt: (file) =>
      `Run the design rule check on ${file}, then export its Gerber and drill files for the fab.`,
    short: (name) => `Gerbers for ${name}`,
  },
  {
    id: "placement",
    group: "Manufacture",
    section: "board",
    label: "Placement file and BOM",
    gets: "The placement file and the BOM as CSVs, for the assembler.",
    skill: "pcb",
    kinds: ["Board"],
    checks: false,
    prompt: (file) =>
      `Export the placement (pick-and-place) file and the bill of materials of ${file} for assembly.`,
    short: (name) => `Placement file for ${name}`,
  },
  {
    id: "standard-parts",
    group: "Manufacture",
    section: "buy",
    label: "Off-the-shelf parts",
    gets: "Each part's STEP file from step.parts, checked against its record.",
    skill: "step-parts",
    kinds: SOLID,
    checks: false,
    prompt: (file) =>
      `Find the off-the-shelf parts ${file} needs, such as fasteners and bearings, with where to buy them, and import their STEP files.`,
    short: (name) => `Find standard parts for ${name}`,
  },
  {
    id: "export-step",
    group: "Manufacture",
    section: "export",
    label: "STEP",
    gets: "A STEP file, saved beside the part.",
    skill: "cad",
    kinds: SOLID,
    checks: false,
    prompt: (file) => `Export ${file} as STEP.`,
    short: (name) => `Export ${name} as STEP`,
  },
  {
    id: "export-mesh",
    group: "Manufacture",
    section: "export",
    label: "STL and 3MF",
    gets: "An STL and a 3MF, saved beside the part.",
    skill: "cad",
    kinds: SOLID,
    checks: false,
    prompt: (file) => `Export ${file} as STL and 3MF.`,
    short: (name) => `Export ${name} as STL and 3MF`,
  },
  {
    id: "drawing",
    group: "Document",
    section: "drawings",
    label: "Engineering drawing",
    gets: "A PDF sheet of views with measured dimensions, hole callouts, notes and a title block.",
    skill: "engineering-drawing",
    kinds: SOLID,
    checks: false,
    prompt: (file) =>
      `Make an engineering drawing of ${file} with its key dimensions and tolerances.`,
    short: (name) => `Draw ${name}`,
  },
  {
    id: "parts-list",
    group: "Document",
    section: "building",
    label: "Parts list",
    gets: "A table in docs/ of each part: how many, its material, and how it is made or bought.",
    skill: null,
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) =>
      `Make a parts list for ${file} in docs/: each part, how many, its material, and how it is made or where to buy it.`,
    short: (name) => `Parts list for ${name}`,
  },
  {
    id: "instructions",
    group: "Document",
    section: "building",
    label: "Assembly instructions",
    gets: "Numbered steps in docs/, each with the parts and tools it needs.",
    skill: null,
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) =>
      `Write assembly instructions for ${file} in docs/, step by step, with the parts and tools each step needs.`,
    short: (name) => `Assembly instructions for ${name}`,
  },
  {
    id: "exploded",
    group: "Document",
    section: "building",
    label: "Exploded view",
    gets: "Exploded-view PNGs that show how its parts go together.",
    skill: "cad",
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) => `Make exploded-view pictures of ${file} that show how its parts go together.`,
    short: (name) => `Exploded view of ${name}`,
  },
  {
    id: "pictures",
    group: "Document",
    section: "pictures",
    label: "Pictures from every side",
    gets: "Four PNGs, from the front, side, top and an angle, for a presentation.",
    skill: "cad",
    kinds: PRINTABLE,
    checks: false,
    prompt: (file) =>
      `Make pictures of ${file} from the front, side, top and an angle, for a presentation.`,
    short: (name) => `Pictures of ${name}`,
  },
  {
    id: "motion-video",
    group: "Document",
    section: "pictures",
    label: "Motion video",
    gets: "An MP4 video of the assembly moving through its range of motion.",
    skill: "cad",
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) => `Make a video of ${file} moving through its range of motion.`,
    short: (name) => `Video of ${name} moving`,
  },
  {
    id: "test-plan",
    group: "Document",
    section: "reports",
    label: "Test plan",
    gets: "A plan in docs/: what to test, how, and the pass criteria.",
    skill: null,
    kinds: SOLID,
    checks: false,
    prompt: (file) =>
      `Write a test plan for ${file} in docs/: what to test, how, and the pass criteria.`,
    short: (name) => `Test plan for ${name}`,
  },
  {
    id: "write-up",
    group: "Document",
    section: "reports",
    label: "Write up the results",
    gets: "A report in docs/: the results with units, pictures, the verdict and what to do next.",
    skill: null,
    kinds: null,
    checks: false,
    prompt: (file) =>
      `Round up what this thread did and found on ${file} in a short report in docs/: what was asked, what was done, the results with units, pictures of the results, the verdict, and what to do next.`,
    short: (name) => `Write up the results for ${name}`,
  },
  {
    id: "urdf",
    group: "Document",
    section: "robot",
    label: "URDF",
    gets: "A validated URDF with its links, joints, limits and a mesh for each link.",
    skill: "urdf",
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) => `Make a URDF for ${file} with its links, joints and limits.`,
    short: (name) => `Describe ${name} as a robot`,
  },
  {
    id: "sdf",
    group: "Document",
    section: "robot",
    label: "SDF for Gazebo",
    gets: "A validated SDF model for Gazebo, with its links, joints and meshes.",
    skill: "sdf",
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) => `Make an SDF model of ${file} for simulating it in Gazebo.`,
    short: (name) => `SDF model of ${name}`,
  },
  {
    id: "srdf",
    group: "Document",
    section: "robot",
    label: "SRDF for MoveIt",
    gets: "A validated SRDF for MoveIt: planning groups, end effectors and collisions to ignore.",
    skill: "srdf",
    kinds: ["Assembly"],
    checks: false,
    prompt: (file) =>
      `Make a MoveIt SRDF for ${file}: its planning groups, end effectors and the collisions to ignore.`,
    short: (name) => `MoveIt SRDF for ${name}`,
  },
];

const GROUPS: ReadonlyArray<HardwareActionGroup> = ["Evaluate", "Manufacture", "Document"];

/** A run of a menu's jobs, under its section's title. */
export interface ActionSection {
  readonly title: string;
  readonly actions: ReadonlyArray<HardwareAction>;
}

export interface HardwareActionMenu {
  readonly group: HardwareActionGroup;
  /** In the menu itself: in Manufacture, the project's own way of making it first. */
  readonly sections: ReadonlyArray<ActionSection>;
  /** The rest, a submenu each, under `moreLabel`. */
  readonly others: ReadonlyArray<ActionSection>;
  /** The heading over the submenus: "More simulations", "Other ways to make it". */
  readonly moreLabel: string;
}

export const MORE_LABELS: Record<HardwareActionGroup, string> = {
  Evaluate: "More simulations",
  Manufacture: "Other ways to make it",
  Document: "More documents",
};

/**
 * The jobs for a part of this kind that the enabled plugins' skills can do, by menu, in order.
 * Manufacture puts the project's own way of making it first, whole, and the other ways apart;
 * until the project has chosen one, every way waits apart.
 */
export function hardwareActions(
  kind: string,
  skills: ReadonlySet<string>,
  process: MakingProcess | string = "Not decided",
): HardwareActionMenu[] {
  const decided = process.trim() !== "" && process !== "Not decided";
  const offered = HARDWARE_ACTIONS.filter(
    (action) =>
      (action.kinds === null || action.kinds.includes(kind)) &&
      (action.skill === null || skills.has(action.skill)),
  );
  const filled = (defs: ReadonlyArray<ActionSectionDef>) =>
    defs
      .map((def) => ({
        title: def.title,
        actions: offered.filter((action) => action.section === def.id),
      }))
      .filter((section) => section.actions.length > 0);
  return GROUPS.flatMap((group): HardwareActionMenu[] => {
    const defs = ACTION_SECTIONS.filter((def) => def.group === group);
    const ours = (def: ActionSectionDef) =>
      def.processes !== undefined && def.processes.some((entry) => entry === process);
    // A way of making it is in the menu itself only when it is the project's own.
    const inMenu = (def: ActionSectionDef) =>
      def.processes === undefined ? !def.more : decided && ours(def);
    const sections = filled([
      ...defs.filter(ours),
      ...defs.filter((def) => inMenu(def) && !ours(def)),
    ]);
    const others = filled(defs.filter((def) => !inMenu(def)));
    if (sections.length === 0 && others.length === 0) return [];
    const moreLabel = group === "Manufacture" && !decided ? "Ways to make it" : MORE_LABELS[group];
    return [{ group, sections, others, moreLabel }];
  });
}
