import {
  AnvilIcon,
  Axis3dIcon,
  CameraIcon,
  ChartColumnIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  DrillIcon,
  DropletIcon,
  DumbbellIcon,
  ExpandIcon,
  FileBoxIcon,
  FoldVerticalIcon,
  GlobeIcon,
  LayersIcon,
  ListOrderedIcon,
  Move3dIcon,
  NotebookPenIcon,
  PencilRulerIcon,
  PrinterIcon,
  PyramidIcon,
  Rotate3dIcon,
  RouteIcon,
  RulerIcon,
  ScanLineIcon,
  ScissorsIcon,
  ShoppingCartIcon,
  SpoolIcon,
  SprayCanIcon,
  SyringeIcon,
  TargetIcon,
  TruckIcon,
  UnfoldVerticalIcon,
  VideoIcon,
  WeightIcon,
  type LucideIcon,
} from "lucide-react";

import type { HardwareAction } from "./hardwareActions";
import { DISCIPLINE_ICONS, KIND_ICONS, MENU_ICONS, MENU_TINTS } from "./kinds";

/**
 * Each job's own picture on its Toolbox tile, by job id (`HARDWARE_ACTIONS`), so the tiles in a
 * section read as different tools. A job's picture says the one thing it is about (a weight for
 * mass, a spool for FDM, a folded and an unfolded sheet for a sheet metal check and its flat
 * pattern); the same idea keeps the same picture across sections (a timer for anything "over
 * time", a truck for an order, a route for a toolpath). The robot face is the AI agent's, so the
 * robot descriptions take Robotics' joints.
 */
const JOB_ICONS: Partial<Record<string, LucideIcon>> = {
  // Evaluate: Simulation
  strength: DumbbellIcon,
  // Fit, motion and mass
  fit: RulerIcon,
  motion: Rotate3dIcon,
  mass: WeightIcon,
  // Results
  "fea-results": ChartColumnIcon,
  "cam-results": RouteIcon,
  // Manufacture: printing, one picture per way of printing
  fdm: SpoolIcon,
  slice: LayersIcon,
  bambu: PrinterIcon,
  resin: DropletIcon,
  sls: ScanLineIcon,
  mjf: SprayCanIcon,
  "metal-print": AnvilIcon,
  // CNC machining
  cnc: DrillIcon,
  toolpaths: RouteIcon,
  // Sheet metal
  "sheet-metal": FoldVerticalIcon,
  "flat-pattern": UnfoldVerticalIcon,
  "sendcutsend-sheet": TruckIcon,
  // Laser and waterjet cutting
  dxf: ScissorsIcon,
  sendcutsend: TruckIcon,
  // Injection molding
  molding: SyringeIcon,
  // Buy and export
  "standard-parts": ShoppingCartIcon,
  "export-step": FileBoxIcon,
  "export-mesh": PyramidIcon,
  // Document
  drawing: KIND_ICONS.Drawings,
  // Datums and the tolerances located from them.
  pmi: TargetIcon,
  "parts-list": ClipboardListIcon,
  instructions: ListOrderedIcon,
  exploded: ExpandIcon,
  pictures: CameraIcon,
  "motion-video": VideoIcon,
  "test-plan": ClipboardCheckIcon,
  "write-up": NotebookPenIcon,
  urdf: DISCIPLINE_ICONS.Robotics,
  sdf: GlobeIcon,
  srdf: Move3dIcon,
};

/** The jobs with a picture of their own, by id: the test holds each to a real job. */
export const JOB_ICON_IDS: ReadonlyArray<string> = Object.keys(JOB_ICONS);

/** A section's picture (`ACTION_SECTIONS`), for a job of it that has none of its own yet. */
const SECTION_ICONS: Partial<Record<string, LucideIcon>> = {
  simulation: DumbbellIcon,
  "fit-mass": RulerIcon,
  results: ChartColumnIcon,
  fdm: SpoolIcon,
  resin: DropletIcon,
  powder: ScanLineIcon,
  "metal-print": AnvilIcon,
  cnc: DrillIcon,
  sheet: FoldVerticalIcon,
  cutting: ScissorsIcon,
  molding: SyringeIcon,
  buy: ShoppingCartIcon,
  export: FileBoxIcon,
  drawings: PencilRulerIcon,
  building: ListOrderedIcon,
  pictures: CameraIcon,
  reports: ClipboardCheckIcon,
  robot: Axis3dIcon,
};

/**
 * A job's picture on its Toolbox tile: its own, else its section's, else its group's (the top
 * bar menu's icon).
 */
export function toolIcon(action: HardwareAction): LucideIcon {
  return JOB_ICONS[action.id] ?? SECTION_ICONS[action.section] ?? MENU_ICONS[action.group];
}

/**
 * The jobs whose tile has a color of its own, by job id: 3D PMI's indigo, so the model-based
 * definition reads apart from the drawing beside it (the Document group's magenta). Never red,
 * amber or green, which say a check failed, needs you or passed (`KIND_TINTS`).
 */
const JOB_TINTS: Partial<Record<string, string>> = {
  pmi: "text-indigo-600 dark:text-indigo-400",
};

/** A job's color on its Toolbox tile: its own, else its group's (`MENU_TINTS`). */
export function toolTint(action: HardwareAction): string {
  return JOB_TINTS[action.id] ?? MENU_TINTS[action.group];
}

/** The jobs with a color of their own, by id: the test holds each to a real job and an allowed hue. */
export const JOB_TINT_IDS: ReadonlyArray<string> = Object.keys(JOB_TINTS);

/** Whether a section (`ACTION_SECTIONS` id) has a picture of its own for its jobs to fall back on. */
export function hasSectionIcon(section: string): boolean {
  return SECTION_ICONS[section] !== undefined;
}
