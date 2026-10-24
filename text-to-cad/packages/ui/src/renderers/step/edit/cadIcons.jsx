/**
 * The workspace's icons, every one from the icon generator (`scripts/nx-icons.py`, drawn by
 * `lib/nxIcons.generated.jsx`): the modeling commands', the toolbar's other buttons and their
 * panels', and the viewer's tools on the strip.
 */
import { NxIcon } from "../../../lib/nxIcons.generated.jsx";

/** One of the generator's icons as a component, sized by the class it is given. */
export const generatedIcon = name => {
  const Icon = ({ className }) => <NxIcon name={name} className={className} />;
  Icon.displayName = `NxIcon(${name})`;
  return Icon;
};

/** Sketch, or Edit Sketch on the one selected; and the sketch's panel. */
export const SketchIcon = generatedIcon("sketch");
/** Finish Sketch. */
export const ExitSketchIcon = generatedIcon("finish-sketch");
/** Measure Bodies: what the part weighs, and where its mass centres. */
export const MassPropertiesIcon = generatedIcon("measure-bodies");
/** Draft Analysis: the part's faces, by how they draw against the pull. */
export const DraftAnalysisIcon = generatedIcon("draft-analysis");
/** Simple Interference: where two bodies fill the same room. */
export const InterferenceIcon = generatedIcon("interference");
/** Compare: the part as it is against a version of it. */
export const CompareIcon = generatedIcon("compare");
/** Edit Object Display: the part's color. */
export const AppearanceIcon = generatedIcon("appearance");
/** Assembly Constraints: a part placed against another. */
export const MateIcon = generatedIcon("assembly-constraints");
/** A drawing (Drawing, and New Sheet). */
export const DrawingIcon = generatedIcon("drawing");
/** Edit Sheet: the drawing's sheet, dimensioned by hand. */
export const EditSheetIcon = generatedIcon("edit-sheet");

/**
 * The generator's icon each modeling command draws. A subtracting command draws its unite
 * command's, because its Boolean is set in its dialog.
 */
export const COMMAND_ICON_NAMES = Object.freeze({
  extrude: "extrude", cut: "extrude", revolve: "revolve", revolve_cut: "revolve", sweep: "sweep", sweep_cut: "sweep",
  loft: "loft", loft_cut: "loft", rib: "rib", hole: "hole", pattern: "pattern", mirror: "mirror", fillet: "blend",
  chamfer: "chamfer", shell: "shell", draft: "draft", plane: "plane", split: "split", delete_body: "delete",
});

/** Each command's mark, in the ribbon and on its panel. */
export const COMMAND_ICONS = Object.freeze(Object.fromEntries(Object.entries(COMMAND_ICON_NAMES).map(([id, name]) => [id, generatedIcon(name)])));

/**
 * The generator's icon of each of the viewer's tools on a part's strip, by its id: Select, Annotate's
 * Pencil and Shapes, Measure, Explode and Clip (NX's Edit Section). The toolbar shows them as the strip does.
 */
export const TOOL_ICON_NAMES = Object.freeze({
  references: "select", pencil: "annotate", shapes: "shapes", measure: "measure", exploded: "exploded", clip: "section",
});
/** Select's icon by what its filter has it pick alone; All, and a pick with none of its own (Position), Select's. */
export const SELECT_ICON_NAMES = Object.freeze({ all: "select", faces: "select-face", edges: "select-edge", parts: "select-part" });

/** A tool's icon on the strip, by its id; Select's by its filter's mode (`pickModeOf`). */
export function ToolIcon({ id, mode = "all", className }) {
  const name = id === "references" ? SELECT_ICON_NAMES[mode] || TOOL_ICON_NAMES.references : TOOL_ICON_NAMES[id];
  return <NxIcon name={name} className={className} />;
}
