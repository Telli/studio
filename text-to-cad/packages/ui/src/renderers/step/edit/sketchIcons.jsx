/**
 * Sketch mode's icons, drawn as SolidWorks draws its Sketch tab's, so each reads before its name
 * does: a line with its end points, a rectangle by its corners or its center, a circle and an arc
 * with their centers, an arc by three points or on from a line, a slot, a polygon in its circle, a
 * centerline's dashes, Smart Dimension's arrows, Exit Sketch's check
 * over a sketch, and the tools that change what is drawn: a rounded corner and its sharp, a line
 * cut back at a crossing, a chain and its offset, a shape and its mirror across a centerline, and
 * a model's face brought down into the sketch.
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
export const ThreePointArcIcon = ({ className }) => <Glyph className={className}><path d="M2.5 11.5A5.5 5.5 0 0 1 13.5 11.5" /><Dot x={2.5} y={11.5} /><Dot x={8} y={6} /><Dot x={13.5} y={11.5} /></Glyph>;
export const TangentArcIcon = ({ className }) => <Glyph className={className}><path d="M2 12h5" strokeOpacity=".55" /><path d="M7 12A5 5 0 0 0 12 7" /><Dot x={7} y={12} /><Dot x={12} y={7} /></Glyph>;
export const PolygonIcon = ({ className }) => <Glyph className={className}><circle cx="8" cy="8" r="5.5" strokeOpacity=".4" strokeDasharray="1.5 1.5" /><path d="M13.5 8 10.75 12.76h-5.5L2.5 8l2.75-4.76h5.5z" /><Dot x={8} y={8} /></Glyph>;
export const SlotIcon = ({ className }) => <Glyph className={className}><path d="M5 5h6a3 3 0 0 1 0 6H5a3 3 0 0 1 0-6z" /><Dot x={5} y={8} /><Dot x={11} y={8} /></Glyph>;
export const CenterlineIcon = ({ className }) => <Glyph className={className}><path d="m3 13 10-10" strokeDasharray="3 1.5 0.5 1.5" /></Glyph>;
export const PointIcon = ({ className }) => <Glyph className={className}><path d="M8 4v8M4 8h8" strokeOpacity=".4" /><circle cx="8" cy="8" r="1.8" fill="currentColor" stroke="none" /></Glyph>;
export const SketchFilletIcon = ({ className }) => <Glyph className={className}><path d="M3 13.5V9a6 6 0 0 1 6-6h4.5" /><path d="M3 5.5V3h2.5" strokeOpacity=".45" strokeDasharray="1 1.2" /></Glyph>;
export const SketchChamferIcon = ({ className }) => <Glyph className={className}><path d="M3 13.5V8l5-5h5.5" /><path d="M3 5.5V3h2.5" strokeOpacity=".45" strokeDasharray="1 1.2" /></Glyph>;
export const TrimIcon = ({ className }) => <Glyph className={className}><path d="M8.5 2.5v11" /><path d="M2 8h6.5" /><path d="M8.5 8H14" strokeOpacity=".35" strokeDasharray="1.4 1.3" /><Dot x={8.5} y={8} /></Glyph>;
export const ExtendIcon = ({ className }) => <Glyph className={className}><path d="M12.5 2.5v11" /><path d="M2 8h5" /><path d="M7 8h5.5" strokeOpacity=".6" strokeDasharray="1.4 1.3" /><Dot x={12.5} y={8} /></Glyph>;
export const OffsetIcon = ({ className }) => <Glyph className={className}><path d="M2.5 13.5v-10h11" /><path d="M5.5 13.5v-7h8" strokeOpacity=".6" /></Glyph>;
export const ConvertEntitiesIcon = ({ className }) => <Glyph className={className}><path d="M3 7v4.5L8 14l5-2.5V7M8 9.5V14" strokeOpacity=".45" /><path d="M3 7 8 4.5 13 7 8 9.5z" /><path d="M8 1v2.4M6.6 2.2 8 3.4l1.4-1.2" strokeOpacity=".7" /></Glyph>;
export const MirrorIcon = ({ className }) => <Glyph className={className}><path d="M8 1.5v13" strokeDasharray="2 1.4" /><path d="M6 4.5 2 11.5h4z" /><path d="m10 4.5 4 7h-4z" strokeOpacity=".55" /></Glyph>;
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
  three_point_arc: ThreePointArcIcon, tangent_arc: TangentArcIcon, slot: SlotIcon, polygon: PolygonIcon, centerline: CenterlineIcon,
  point: PointIcon, dimension: SmartDimensionIcon,
  fillet: SketchFilletIcon, chamfer: SketchChamferIcon, trim: TrimIcon, extend: ExtendIcon, offset: OffsetIcon, mirror: MirrorIcon, convert: ConvertEntitiesIcon,
});
