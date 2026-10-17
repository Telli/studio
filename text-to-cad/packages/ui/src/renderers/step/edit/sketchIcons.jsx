/**
 * Sketch mode's icons, drawn as SolidWorks draws its Sketch tab's, so each reads before its name
 * does: a line with its end points, a rectangle by its corners or its center, a circle and an arc
 * with their centers, a slot, a centerline's dashes, Smart Dimension's arrows, and Exit Sketch's
 * check over a sketch.
 */
function Glyph({ children, className }) {
  return <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.25} strokeLinecap="round" strokeLinejoin="round"
    className={className} aria-hidden="true">{children}</svg>;
}
const Dot = ({ x, y }) => <circle cx={x} cy={y} r={1.1} fill="currentColor" stroke="none" />;

export const SketchToolIcon = ({ className }) => <Glyph className={className}><path d="M2 13.5 4.5 6h9L11 13.5z" strokeOpacity=".55" /><path d="m6 11 6.5-6.5 1.5 1.5L7.5 12.5 5.5 13z" /></Glyph>;
export const ExitSketchIcon = ({ className }) => <Glyph className={className}><path d="M2 13.5 4.5 6h9L11 13.5z" strokeOpacity=".5" /><path d="m5.5 7.5 2.3 2.5 5-6" strokeWidth={1.6} /></Glyph>;
export const SmartDimensionIcon = ({ className }) => <Glyph className={className}><path d="M2.5 4v6M13.5 4v6M2.5 7h11" /><path d="m4.5 5.6-2 1.4 2 1.4M11.5 5.6l2 1.4-2 1.4" /><path d="M5.5 12.5h5" strokeOpacity=".55" /></Glyph>;
export const LineIcon = ({ className }) => <Glyph className={className}><path d="m3 13 10-10" /><Dot x={3} y={13} /><Dot x={13} y={3} /></Glyph>;
export const CornerRectangleIcon = ({ className }) => <Glyph className={className}><rect x="2.5" y="4" width="11" height="8" /><Dot x={2.5} y={12} /><Dot x={13.5} y={4} /></Glyph>;
export const CenterRectangleIcon = ({ className }) => <Glyph className={className}><rect x="2.5" y="4" width="11" height="8" /><path d="M2.5 4l11 8" strokeOpacity=".4" strokeDasharray="1.5 1.5" /><Dot x={8} y={8} /></Glyph>;
export const CircleIcon = ({ className }) => <Glyph className={className}><circle cx="8" cy="8" r="5.5" /><Dot x={8} y={8} /></Glyph>;
export const ArcIcon = ({ className }) => <Glyph className={className}><path d="M3 11A5.5 5.5 0 0 1 13 11" /><Dot x={8} y={11} /><Dot x={3} y={11} /><Dot x={13} y={11} /></Glyph>;
export const SlotIcon = ({ className }) => <Glyph className={className}><path d="M5 5h6a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6z" /><Dot x={5} y={8} /><Dot x={11} y={8} /></Glyph>;
export const CenterlineIcon = ({ className }) => <Glyph className={className}><path d="m3 13 10-10" strokeDasharray="3 1.5 0.5 1.5" /></Glyph>;
export const PointIcon = ({ className }) => <Glyph className={className}><path d="M8 4v8M4 8h8" strokeOpacity=".4" /><circle cx="8" cy="8" r="1.8" fill="currentColor" stroke="none" /></Glyph>;
export const AddRelationIcon = ({ className }) => <Glyph className={className}><path d="M2.5 11.5h7" /><path d="M6.5 4.5v7" /><rect x="10" y="2.5" width="4" height="4" rx=".6" strokeOpacity=".6" /><path d="M11.4 4.5h1.2" strokeOpacity=".6" /></Glyph>;
export const ConstructionIcon = ({ className }) => <Glyph className={className}><path d="m3 13 10-10" strokeDasharray="2 1.6" /><Dot x={3} y={13} /><Dot x={13} y={3} /></Glyph>;
export const NormalToIcon = ({ className }) => <Glyph className={className}><path d="M3 12.5 5 6.5h8l-2 6z" strokeOpacity=".55" /><path d="M8 9.5V2.5M6.3 4.2 8 2.5l1.7 1.7" /></Glyph>;
export const DiscardIcon = ({ className }) => <Glyph className={className}><path d="M2 13.5 4.5 6h9L11 13.5z" strokeOpacity=".5" /><path d="m6 7 5 5M11 7l-5 5" strokeWidth={1.5} /></Glyph>;
export const ExtrudedBossIcon = ({ className }) => <Glyph className={className}><path d="M3 9.5 8 7l5 2.5v3L8 15l-5-2.5z" /><path d="M3 9.5 8 12l5-2.5M8 12v3" /><path d="M8 6V1.5M6.4 3.1 8 1.5l1.6 1.6" /></Glyph>;
export const ExtrudedCutIcon = ({ className }) => <Glyph className={className}><path d="M2.5 6.5 8 4l5.5 2.5V12L8 14.5 2.5 12z" /><path d="m5.5 7.5 2.5 1.2 2.5-1.2v2.5L8 11.2 5.5 10z" /><path d="M8 1v4.5" strokeOpacity=".6" /></Glyph>;

export const RevolvedBossIcon = ({ className }) => <Glyph className={className}><path d="M3 2v12" strokeDasharray="2 1.5" /><path d="M6 4h4v8H6" /><path d="M10 4c2.5.6 3.5 2 3.5 4s-1 3.4-3.5 4" strokeOpacity=".6" /></Glyph>;
export const RevolvedCutIcon = ({ className }) => <Glyph className={className}><path d="M3 2v12" strokeDasharray="2 1.5" /><rect x="5.5" y="3.5" width="8" height="9" rx=".5" /><path d="M8 6h3v4H8z" strokeOpacity=".6" /></Glyph>;

/** Each sketch tool's icon, by its id in `SKETCH_TOOLS`. */
export const SKETCH_TOOL_ICONS = Object.freeze({
  line: LineIcon, rectangle: CornerRectangleIcon, center_rectangle: CenterRectangleIcon, circle: CircleIcon, arc: ArcIcon,
  slot: SlotIcon, centerline: CenterlineIcon, point: PointIcon, dimension: SmartDimensionIcon,
});
