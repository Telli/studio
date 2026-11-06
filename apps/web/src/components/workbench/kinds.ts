import {
  Axis3dIcon,
  BookOpenIcon,
  BoxIcon,
  CircuitBoardIcon,
  FactoryIcon,
  FilePlusIcon,
  FileTextIcon,
  GaugeIcon,
  ImageIcon,
  MessageSquareIcon,
  PackageIcon,
  PencilRulerIcon,
  ShapesIcon,
  SlidersHorizontalIcon,
  type LucideIcon,
} from "lucide-react";

import type { HardwareActionGroup } from "./hardwareActions";
import type { Discipline, NewTemplate } from "./newTemplates";
import type { ProjectGroup } from "./projectFiles";

/**
 * One icon for each kind of thing a project holds, the same wherever Studio shows it: the
 * Overview's list of everything in the project, New, the part cards, the top bar's menus, the quick
 * find and the chat's change chips. Three kinds are designed from nothing (CAD, Electronics,
 * Documents); FEA and CAM are not kinds of design but work done on one, so what the top bar's
 * menus make (Analysis from Evaluate, Manufacturing from Manufacture, Drawings from Document)
 * carries the menu's icon and shows on the part it was made from, as a CAD system keeps a study
 * or a toolpath with its part.
 */
export const KIND_ICONS: Readonly<Record<ProjectGroup, LucideIcon>> = {
  CAD: BoxIcon,
  Electronics: CircuitBoardIcon,
  Documents: FileTextIcon,
  Drawings: PencilRulerIcon,
  Analysis: GaugeIcon,
  Manufacturing: FactoryIcon,
  Images: ImageIcon,
  "Reference parts": PackageIcon,
  References: BookOpenIcon,
};

/** New's disciplines, by the kind of thing each makes. */
export const DISCIPLINE_ICONS: Readonly<Record<Discipline, LucideIcon>> = {
  CAD: KIND_ICONS.CAD,
  Electronics: KIND_ICONS.Electronics,
  Analysis: KIND_ICONS.Analysis,
  Manufacturing: KIND_ICONS.Manufacturing,
  // The robot face is the AI agent's (Settings, the chat); Robotics is the joints of a mechanism.
  Robotics: Axis3dIcon,
  Documents: KIND_ICONS.Documents,
};

/** A New template's icon: the kind of thing it makes, a drawing's own, or a file of the person's. */
export function templateIcon(template: NewTemplate) {
  if (template.file !== undefined) return FilePlusIcon;
  return template.id === "drawing" ? KIND_ICONS.Drawings : DISCIPLINE_ICONS[template.discipline];
}

/** The top bar's menus, by what their jobs make. */
export const MENU_ICONS: Readonly<Record<HardwareActionGroup, LucideIcon>> = {
  Evaluate: KIND_ICONS.Analysis,
  Manufacture: KIND_ICONS.Manufacturing,
  Document: KIND_ICONS.Documents,
};

/** The kind each kind of file (`partNames.ts`) is filed under. */
const FILE_KINDS: Readonly<Record<string, ProjectGroup>> = {
  Part: "CAD",
  Design: "CAD",
  Mesh: "CAD",
  Source: "CAD",
  Robot: "CAD",
  "Planning groups": "CAD",
  "Simulation model": "CAD",
  Board: "Electronics",
  Schematic: "Electronics",
  Harness: "Electronics",
  Drawing: "Drawings",
  "FEA study": "Analysis",
  Result: "Analysis",
  "CAM job": "Manufacturing",
  Toolpath: "Manufacturing",
  "G-code": "Manufacturing",
  Gerbers: "Manufacturing",
  "Bill of materials": "Manufacturing",
  "Pick and place": "Manufacturing",
  Document: "Documents",
  Table: "Documents",
  Image: "Images",
};

/** The icons a file can take: its kind's, or the project's setup. */
export const FILE_ICONS: Readonly<Record<ProjectGroup | "Setup", LucideIcon>> = {
  ...KIND_ICONS,
  Setup: SlidersHorizontalIcon,
};

/**
 * Which icon a file takes by what it is ("G-code", "Strength check", "Board"): its kind's, the
 * setup's, or, for anything else, a document's.
 */
export function fileIconKey(kind: string): ProjectGroup | "Setup" {
  if (kind === "Setup") return "Setup";
  if (kind.endsWith(" check")) return "Analysis";
  return FILE_KINDS[kind] ?? "Documents";
}

/** A project's chats, beside the kinds of file it holds (the Overview's list of everything). */
export const CHAT_ICON: LucideIcon = MessageSquareIcon;

/** Studio's examples, in the Library's Examples section. */
export const EXAMPLES_ICON: LucideIcon = ShapesIcon;

/**
 * The quiet grey of a kind's icon on anything you act on: tiles, the Toolbox, New and the menus, so
 * those screens hold one accent (the brand blue) and the status colors alone.
 */
export const KIND_TINT = "text-muted-foreground";

/**
 * A file's mark where files of different formats sit together (tabs, file lists, Find, the chat's
 * chips): a muted hue of its own for the kinds you scan for, grey for the rest, the icon alone and
 * never its words. Never red, amber or green, which say failed, warning and passed. The hues are
 * theme tokens (`brand/theme.css`).
 */
const FILE_TINTS: Partial<Record<ProjectGroup | "Setup", string>> = {
  CAD: "text-(--kind-cad)",
  Electronics: "text-(--kind-electronics)",
  Analysis: "text-(--kind-analysis)",
  Documents: "text-(--kind-document)",
  Drawings: "text-(--kind-document)",
};

export function fileTint(key: ProjectGroup | "Setup"): string {
  return FILE_TINTS[key] ?? KIND_TINT;
}
