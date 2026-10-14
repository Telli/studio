/**
 * Hardware first, code second (`brand.json` `"focus": "hardware"`). The
 * workbench speaks a hardware engineer's verbs: check a part, make it,
 * document it. Each is a job the agent already knows through one of
 * text-to-cad's skills, offered only while an enabled plugin has that skill
 * and only on the kinds of file it applies to. A pick writes the job into the
 * composer, naming the part, to edit before sending.
 */
export const HARDWARE_FOCUS = import.meta.env.VITE_APP_FOCUS === "hardware";

export type HardwareActionGroup = "Check" | "Make" | "Document";

export interface HardwareAction {
  readonly id: string;
  readonly group: HardwareActionGroup;
  readonly label: string;
  /** The text-to-cad skill the job runs on. */
  readonly skill: string;
  /** The part kinds it applies to, as the context strip names them (`describePart`). */
  readonly kinds: ReadonlyArray<string>;
  readonly prompt: (file: string) => string;
  /** The job as a starter names it, short: "Check l_bracket for CNC machining". */
  readonly short: (name: string) => string;
}

const SOLID = ["Part", "Assembly"];
const PRINTABLE = ["Part", "Assembly", "Mesh"];

export const HARDWARE_ACTIONS: ReadonlyArray<HardwareAction> = [
  {
    id: "strength",
    group: "Check",
    label: "Strength under load",
    skill: "fea",
    kinds: SOLID,
    prompt: (file) =>
      `Check ${file} for strength under its working load. Ask me for the loads, supports and material you need, then tell me where it is weakest and what to change.`,
    short: (name) => `Check ${name} under load`,
  },
  {
    id: "fea-results",
    group: "Check",
    label: "Explain these results",
    skill: "fea",
    kinds: ["FEA study"],
    prompt: (file) =>
      `Walk me through the results in ${file}: what fails, by how much, and what to change.`,
    short: (name) => `Explain the ${name} study`,
  },
  {
    id: "cnc",
    group: "Check",
    label: "CNC machining",
    skill: "dfm",
    kinds: SOLID,
    prompt: (file) => `Check ${file} for CNC machining and tell me what to change.`,
    short: (name) => `Check ${name} for CNC machining`,
  },
  {
    id: "sheet-metal",
    group: "Check",
    label: "Sheet metal",
    skill: "dfm",
    kinds: ["Part"],
    prompt: (file) =>
      `Check ${file} as a sheet metal part: bend radii, reliefs, and hole and edge distances. Tell me what to change.`,
    short: (name) => `Check ${name} as sheet metal`,
  },
  {
    id: "molding",
    group: "Check",
    label: "Injection molding",
    skill: "dfm",
    kinds: ["Part"],
    prompt: (file) =>
      `Check ${file} for injection molding: draft, wall thickness and undercuts. Tell me what to change.`,
    short: (name) => `Check ${name} for injection molding`,
  },
  {
    id: "printing",
    group: "Check",
    label: "3D printing",
    skill: "dfam-check",
    kinds: PRINTABLE,
    prompt: (file) =>
      `Check ${file} for 3D printing: overhangs, thin walls and the best build orientation.`,
    short: (name) => `Check ${name} for 3D printing`,
  },
  {
    id: "board-fab",
    group: "Check",
    label: "Board for fabrication",
    skill: "pcb-dfm",
    kinds: ["Board"],
    prompt: (file) =>
      `Check ${file} against the fab's limits and tell me what to fix before ordering.`,
    short: (name) => `Check ${name} for fabrication`,
  },
  {
    id: "cam-results",
    group: "Check",
    label: "Explain this job",
    skill: "cam",
    kinds: ["CAM job"],
    prompt: (file) =>
      `Walk me through ${file}: cycle time, tools, and anything to fix before cutting.`,
    short: (name) => `Explain the ${name} job`,
  },
  {
    id: "grbl",
    group: "Make",
    label: "G-code for grbl",
    skill: "cam",
    kinds: ["Part"],
    prompt: (file) =>
      `Post G-code for ${file} for a grbl router. Ask me for the stock, tools and workholding you need.`,
    short: (name) => `Post G-code for ${name}`,
  },
  {
    id: "slice",
    group: "Make",
    label: "Slice for FDM",
    skill: "gcode",
    kinds: PRINTABLE,
    prompt: (file) => `Slice ${file} for FDM printing and check the G-code.`,
    short: (name) => `Slice ${name} for printing`,
  },
  {
    id: "bambu",
    group: "Make",
    label: "Print on a Bambu printer",
    skill: "bambu-labs",
    kinds: PRINTABLE,
    prompt: (file) =>
      `Slice ${file} and get it ready on my Bambu printer. Check with me before the print starts.`,
    short: (name) => `Print ${name} on the Bambu`,
  },
  {
    id: "dxf",
    group: "Make",
    label: "Cut-ready DXF",
    skill: "dxf",
    kinds: ["Part", "Drawing"],
    prompt: (file) => `Make a cut-ready DXF of ${file} for laser or waterjet cutting.`,
    short: (name) => `Make a cut file of ${name}`,
  },
  {
    id: "sendcutsend",
    group: "Make",
    label: "Order from SendCutSend",
    skill: "sendcutsend",
    kinds: ["Part", "Drawing"],
    prompt: (file) =>
      `Check ${file} for a SendCutSend order: material, thickness and any services it needs.`,
    short: (name) => `Get ${name} ready for SendCutSend`,
  },
  {
    id: "route",
    group: "Make",
    label: "Route the board",
    skill: "pcb",
    kinds: ["Board"],
    prompt: (file) => `Route ${file}.`,
    short: (name) => `Route ${name}`,
  },
  {
    id: "drawing",
    group: "Document",
    label: "Engineering drawing",
    skill: "engineering-drawing",
    kinds: SOLID,
    prompt: (file) =>
      `Make an engineering drawing of ${file} with its key dimensions and tolerances.`,
    short: (name) => `Draw ${name}`,
  },
  {
    id: "standard-parts",
    group: "Document",
    label: "Off-the-shelf parts",
    skill: "step-parts",
    kinds: SOLID,
    prompt: (file) =>
      `Find the off-the-shelf parts ${file} needs, such as fasteners and bearings, and bring in their STEP files.`,
    short: (name) => `Find standard parts for ${name}`,
  },
  {
    id: "exports",
    group: "Document",
    label: "STL and 3MF",
    skill: "cad",
    kinds: SOLID,
    prompt: (file) => `Export ${file} as STL and 3MF.`,
    short: (name) => `Export ${name} as STL and 3MF`,
  },
  {
    id: "urdf",
    group: "Document",
    label: "Robot description (URDF)",
    skill: "urdf",
    kinds: ["Assembly"],
    prompt: (file) => `Make a URDF for ${file}, with its joints and limits.`,
    short: (name) => `Describe ${name} as a robot`,
  },
];

const GROUPS: ReadonlyArray<HardwareActionGroup> = ["Check", "Make", "Document"];

/** The jobs for a part of this kind that the enabled plugins' skills can do, by group, in order. */
export function hardwareActions(
  kind: string,
  skills: ReadonlySet<string>,
): Array<{ readonly group: HardwareActionGroup; readonly actions: HardwareAction[] }> {
  return GROUPS.flatMap((group) => {
    const actions = HARDWARE_ACTIONS.filter(
      (action) => action.group === group && action.kinds.includes(kind) && skills.has(action.skill),
    );
    return actions.length === 0 ? [] : [{ group, actions }];
  });
}
