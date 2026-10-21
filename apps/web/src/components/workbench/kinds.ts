import {
  BookOpenIcon,
  BotIcon,
  BoxIcon,
  CircuitBoardIcon,
  FactoryIcon,
  FileTextIcon,
  GaugeIcon,
  ImageIcon,
  type LucideIcon,
  PackageIcon,
  PencilRulerIcon,
  SlidersHorizontalIcon,
} from "lucide-react";

import type { HardwareActionGroup } from "./hardwareActions";
import type { Discipline } from "./newTemplates";
import type { ProjectGroup } from "./projectFiles";

/**
 * One icon for each kind of thing a project holds, the same wherever Studio shows it: New, the
 * Overview's modules and cards, the top bar's menus, the quick find and the chat's change chips.
 * Three kinds are designed from nothing (Mechanical, Electrical, Documents); FEA and CAM are not
 * kinds of design but work done on one, so what the top bar's menus make (Studies from Evaluate,
 * Manufacturing from Manufacture, Drawings from Document) carries the menu's icon and shows on
 * the part it was made from, as a CAD system keeps a study or a toolpath with its part.
 */
export const KIND_ICONS: Readonly<Record<ProjectGroup, LucideIcon>> = {
  Mechanical: BoxIcon,
  Electrical: CircuitBoardIcon,
  Documents: FileTextIcon,
  Drawings: PencilRulerIcon,
  Studies: GaugeIcon,
  Manufacturing: FactoryIcon,
  Images: ImageIcon,
  "Reference parts": PackageIcon,
  References: BookOpenIcon,
};

/** New's disciplines, by the kind of thing each makes. */
export const DISCIPLINE_ICONS: Readonly<Record<Discipline, LucideIcon>> = {
  Mechanical: KIND_ICONS.Mechanical,
  Electrical: KIND_ICONS.Electrical,
  Simulation: KIND_ICONS.Studies,
  Manufacturing: KIND_ICONS.Manufacturing,
  Robotics: BotIcon,
  Documents: KIND_ICONS.Documents,
};

/** The top bar's menus, by what their jobs make. */
export const MENU_ICONS: Readonly<Record<HardwareActionGroup, LucideIcon>> = {
  Evaluate: KIND_ICONS.Studies,
  Manufacture: KIND_ICONS.Manufacturing,
  Document: KIND_ICONS.Documents,
};

/** The kind each kind of file (`partNames.ts`) is filed under. */
const FILE_KINDS: Readonly<Record<string, ProjectGroup>> = {
  Part: "Mechanical",
  Design: "Mechanical",
  Mesh: "Mechanical",
  Source: "Mechanical",
  Robot: "Mechanical",
  "Planning groups": "Mechanical",
  "Simulation model": "Mechanical",
  Board: "Electrical",
  Schematic: "Electrical",
  Harness: "Electrical",
  Drawing: "Drawings",
  "FEA study": "Studies",
  Result: "Studies",
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
  if (kind.endsWith(" check")) return "Studies";
  return FILE_KINDS[kind] ?? "Documents";
}
