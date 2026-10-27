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
 * Each kind's color, as Google Drive colors Docs, Sheets and Slides, so a kind is told at a glance
 * in a list of everything, each kind a hue of its own: blue CAD (the one blue), violet
 * electronics (purple boards), magenta documents and the drawings the Document menu makes, cyan
 * analysis, steel grey manufacturing, and quiet grey for chats and what is gathered for a part.
 * Never red, amber or green, which say a check failed, needs you or passed.
 */
export const KIND_TINTS: Readonly<Record<ProjectGroup | "Chats", string>> = {
  Chats: "text-slate-500 dark:text-slate-400",
  CAD: "text-blue-600 dark:text-blue-400",
  Drawings: "text-fuchsia-600 dark:text-fuchsia-400",
  "Reference parts": "text-slate-500 dark:text-slate-400",
  Electronics: "text-violet-600 dark:text-violet-400",
  Analysis: "text-cyan-600 dark:text-cyan-400",
  Manufacturing: "text-slate-600 dark:text-slate-300",
  Documents: "text-fuchsia-600 dark:text-fuchsia-400",
  Images: "text-slate-500 dark:text-slate-400",
  References: "text-slate-500 dark:text-slate-400",
};

/**
 * The top bar's menus' color, the kind their jobs make (as `MENU_ICONS`): the Toolbox tints each
 * job's tile with its group's.
 */
export const MENU_TINTS: Readonly<Record<HardwareActionGroup, string>> = {
  Evaluate: KIND_TINTS.Analysis,
  Manufacture: KIND_TINTS.Manufacturing,
  Document: KIND_TINTS.Documents,
};

/** A New template's icon color: its kind's, as the Overview and ⌘K color that kind. */
export function templateTint(template: NewTemplate): string {
  if (template.file !== undefined || template.discipline === "Documents")
    return KIND_TINTS.Documents;
  if (template.id === "drawing") return KIND_TINTS.Drawings;
  return template.discipline === "Robotics" ? KIND_TINTS.CAD : KIND_TINTS[template.discipline];
}
