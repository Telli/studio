import { Boxes, Paperclip, Sigma } from "lucide-react";
import { TREE_GLYPH_CLASS, TREE_GLYPH_STROKE } from "@text-to-cad/ui/primitives/tree-row";
import * as cad from "./cadIcons.jsx";
import { featureIconName } from "./nx.js";
import { NxIcon } from "./nxIcons.generated.jsx";

// `nx.js` names the generator's icon of each kind, where a plain `node --test` can load it (this file
// imports the package's compiled exports); the name is exported here too, beside the icon that draws it.
export { featureIconName };

/**
 * The design tree's icons, drawn as a CAD tool draws them, so a row reads before its name does: a
 * plane is a parallelogram and the origin its axes, in the tree's grey; a sketch, and each
 * feature, the ribbon's own picture of it, in its CAD colors, as NX's Part Navigator repeats its
 * ribbon's icons (a feature's is the generator's: `nxIcons.generated.jsx`).
 */
function Glyph({ children }) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={TREE_GLYPH_STROKE} strokeLinecap="round"
    strokeLinejoin="round" className={TREE_GLYPH_CLASS} aria-hidden="true">{children}</svg>;
}

export const PlaneIcon = () => <Glyph><path d="M2.5 12 5.5 4h8l-3 8z" /></Glyph>;
export const OriginIcon = () => <Glyph><path d="M7 9V2.5M7 9h6.5M7 9l-4 4" /><circle cx="7" cy="9" r="1.2" /></Glyph>;
// The colored icons at 16px, as a CAD tree draws its own, in the 12px the tree keeps for an icon.
const COLORED_CLASS = "-m-0.5 size-4 shrink-0";
export const SketchIcon = () => <cad.SketchIcon className={COLORED_CLASS} />;
export const PartIcon = () => <Glyph><path d="M8 2 13.5 5v6L8 14l-5.5-3V5z" /><path d="M2.5 5 8 8l5.5-3M8 8v6" /></Glyph>;

/** A feature's icon by its kind, as the engine names it or NX does; a kind without one of its own reads as a solid feature. */
export function FeatureIcon({ kind }) {
  return <NxIcon name={featureIconName(kind)} className={COLORED_CLASS} />;
}

export const AssemblyIcon = () => <Boxes className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />;
export const MateTreeIcon = () => <Paperclip className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />;
export const ParametersIcon = () => <Sigma className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />;
