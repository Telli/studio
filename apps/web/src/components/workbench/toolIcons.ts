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
import { DISCIPLINE_ICONS, KIND_ICONS, MENU_ICONS } from "./kinds";

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
  // Laser and waterjet cutting
  dxf: ScissorsIcon,
  sendcutsend: TruckIcon,
  // Injection molding
  molding: SyringeIcon,
  // Files and off-the-shelf parts
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
  printing: SpoolIcon,
  machining: DrillIcon,
  sheet: FoldVerticalIcon,
  files: FileBoxIcon,
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

/** Whether a section (`ACTION_SECTIONS` id) has a picture of its own for its jobs to fall back on. */
export function hasSectionIcon(section: string): boolean {
  return SECTION_ICONS[section] !== undefined;
}
