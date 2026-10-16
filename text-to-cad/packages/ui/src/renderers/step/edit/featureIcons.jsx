import { Boxes, CircleDot, FlipHorizontal2, Grid3x3, Move3d, PackageOpen, Rotate3d, Sigma, SquareRoundCorner } from "lucide-react";
import { TREE_GLYPH_CLASS, TREE_GLYPH_STROKE } from "@text-to-cad/ui/primitives/tree-row";

/**
 * The design tree's icons, drawn as a CAD tool draws them, so a row reads before its name does:
 * a plane is a parallelogram, the origin its axes, a sketch a profile on a plane, an extruded boss
 * a block, a cut a block with a pocket. Kinds a general icon says well (a hole, a pattern) use one.
 */
function Glyph({ children }) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={TREE_GLYPH_STROKE} strokeLinecap="round"
    strokeLinejoin="round" className={TREE_GLYPH_CLASS} aria-hidden="true">{children}</svg>;
}

export const PlaneIcon = () => <Glyph><path d="M2.5 12 5.5 4h8l-3 8z" /></Glyph>;
export const OriginIcon = () => <Glyph><path d="M7 9V2.5M7 9h6.5M7 9l-4 4" /><circle cx="7" cy="9" r="1.2" /></Glyph>;
export const SketchIcon = () => <Glyph><path d="M2 12.5 4.5 5h9L11 12.5z" strokeOpacity=".55" /><path d="M5.5 10.5c1-3 3.5-3.6 5-2" /></Glyph>;
export const PartIcon = () => <Glyph><path d="M8 2 13.5 5v6L8 14l-5.5-3V5z" /><path d="M2.5 5 8 8l5.5-3M8 8v6" /></Glyph>;
const BossIcon = () => <Glyph><path d="M3 7.5 8 5l5 2.5v4.5L8 14.5 3 12z" /><path d="M3 7.5 8 10l5-2.5M8 10v4.5M8 1.5v3" /></Glyph>;
const CutIcon = () => <Glyph><path d="M2.5 6.5 8 4l5.5 2.5V12L8 14.5 2.5 12z" /><path d="m5.5 7.5 2.5 1.2 2.5-1.2v2.5L8 11.2 5.5 10z" /></Glyph>;
const ChamferIcon = () => <Glyph><path d="M3 13V7l4-4h6" /><path d="M3 13h10V3" strokeOpacity=".45" /></Glyph>;

const KIND_ICONS = Object.freeze({
  "Boss-Extrude": BossIcon, "Cut-Extrude": CutIcon, "Intersect-Extrude": CutIcon,
  "Boss-Revolve": () => <Rotate3d className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />,
  "Cut-Revolve": () => <Rotate3d className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />,
  Fillet: () => <SquareRoundCorner className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />,
  Chamfer: ChamferIcon,
  Hole: () => <CircleDot className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />,
  Shell: () => <PackageOpen className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />,
  Pattern: () => <Grid3x3 className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />,
  Mirror: () => <FlipHorizontal2 className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />,
  "Move/Copy": () => <Move3d className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />,
});

/** A feature's icon by its kind; a kind without one of its own reads as a solid feature. */
export function FeatureIcon({ kind }) {
  const Icon = KIND_ICONS[kind] || BossIcon;
  return <Icon />;
}

export const AssemblyIcon = () => <Boxes className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />;
export const ParametersIcon = () => <Sigma className={TREE_GLYPH_CLASS} strokeWidth={TREE_GLYPH_STROKE} aria-hidden="true" />;
