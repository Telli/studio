/**
 * Edit mode's command icons, drawn as a CAD tool draws its CommandManager's: each a picture of
 * what the command does to a block, so Extruded Boss and Extruded Cut, Fillet and Chamfer, read
 * apart at a glance. Material in amber (`--cad-solid`), material taken away in red (`--cad-cut`),
 * a sketch in blue (`--cad-sketch`), what the feature changes in teal (`--cad-accent`), as in
 * `styles/tokens.css`. 24 units square; sized by the class given.
 */

const SOLID = Object.freeze({ fill: "var(--cad-solid)", stroke: "var(--cad-solid-edge)", strokeWidth: 1, strokeLinejoin: "round" });
const SHADE = Object.freeze({ fill: "#000", stroke: "none" });
const CUT = Object.freeze({ fill: "var(--cad-cut)", stroke: "none" });
const ACCENT = Object.freeze({ fill: "none", stroke: "var(--cad-accent)", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" });
const SKETCH = Object.freeze({ fill: "none", stroke: "var(--cad-sketch)", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" });
const CUT_LINE = Object.freeze({ ...ACCENT, stroke: "var(--cad-cut)" });

function Icon({ className, children }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">{children}</svg>;
}

/** A block seen from above, front and right: its top lit, its sides shaded. */
function Block({ top = "M3 10 11 6l8 4-8 4z", left = "M3 10l8 4v7l-8-4z", right = "M11 14l8-4v7l-8 4z" }) {
  return <>
    <path d={left} style={SOLID} />
    <path d={left} style={SHADE} opacity={0.12} />
    <path d={right} style={SOLID} />
    <path d={right} style={SHADE} opacity={0.26} />
    <path d={top} style={SOLID} />
  </>;
}

const Arrow = ({ d, head, style = ACCENT }) => <><path d={d} style={style} /><path d={head} style={style} /></>;

export const ExtrudedBossIcon = ({ className }) => <Icon className={className}>
  <Block />
  <Arrow d="M11 10V1.8" head="M8.4 4.3 11 1.8l2.6 2.5" />
</Icon>;

export const ExtrudedCutIcon = ({ className }) => <Icon className={className}>
  <Block />
  <path d="M7.4 9.8 11 8l3.6 1.8L11 11.6z" style={CUT} />
  <path d="M7.4 9.8 11 11.6v2.4l-3.6-1.8z" style={CUT} opacity={0.65} />
  <Arrow d="M11 1.6v6" head="M8.6 5.2 11 7.6l2.4-2.4" style={CUT_LINE} />
</Icon>;

export const RevolvedBossIcon = ({ className }) => <Icon className={className}>
  <path d="M6 9v9a6 2.6 0 0 0 12 0V9z" style={SOLID} />
  <path d="M12 9v11.6a6 2.6 0 0 0 6-2.6V9z" style={SHADE} opacity={0.22} />
  <ellipse cx="12" cy="9" rx="6" ry="2.6" style={SOLID} />
  <path d="M12 2.5v20" style={{ ...SKETCH, strokeWidth: 1.2 }} strokeDasharray="2.2 1.6" />
  <Arrow d="M4.4 6.2A8 3 0 0 1 19.6 6.2" head="M17.3 4.6 19.6 6.2l-2.4 1.3" />
</Icon>;

export const RevolvedCutIcon = ({ className }) => <Icon className={className}>
  <path d="M6 6v12a6 2.6 0 0 0 12 0V6z" style={SOLID} />
  <path d="M12 6v14.6a6 2.6 0 0 0 6-2.6V6z" style={SHADE} opacity={0.22} />
  <ellipse cx="12" cy="6" rx="6" ry="2.6" style={SOLID} />
  <path d="M6 11a6 2.6 0 0 0 12 0v3a6 2.6 0 0 1-12 0z" style={CUT} />
  <path d="M12 1.5v21" style={{ ...SKETCH, strokeWidth: 1.2 }} strokeDasharray="2.2 1.6" />
</Icon>;

export const HoleIcon = ({ className }) => <Icon className={className}>
  <Block />
  <ellipse cx="11" cy="10" rx="3.6" ry="1.8" style={CUT} />
  <ellipse cx="11" cy="10.4" rx="2.4" ry="1.15" style={SHADE} opacity={0.35} />
  <path d="M11 1.5v6.4" style={{ ...ACCENT, strokeWidth: 1.25 }} strokeDasharray="2 1.4" />
</Icon>;

/** Three blocks in a row, the first the feature and the rest its copies. */
export const PatternIcon = ({ className }) => <Icon className={className}>
  {[[0, 1], [6, 0.7], [12, 0.45]].map(([dx, opacity]) => <g key={dx} transform={`translate(${dx} ${-dx / 2 + 6})`} opacity={opacity}>
    <path d="M1 8l4-2 4 2-4 2z" style={SOLID} />
    <path d="M1 8l4 2v5l-4-2z" style={SOLID} />
    <path d="M5 10l4-2v5l-4 2z" style={SOLID} />
    <path d="M5 10l4-2v5l-4 2z" style={SHADE} opacity={0.26} />
  </g>)}
</Icon>;

/** A block and its mirror image across a plane. */
export const MirrorIcon = ({ className }) => <Icon className={className}>
  <path d="M12 2v20" style={{ ...SKETCH, strokeWidth: 1.4 }} strokeDasharray="2.4 1.6" />
  <g>
    <path d="M2 10l4-2 4 2-4 2z" style={SOLID} />
    <path d="M2 10l4 2v6l-4-2z" style={SOLID} />
    <path d="M6 12l4-2v6l-4 2z" style={SOLID} />
    <path d="M6 12l4-2v6l-4 2z" style={SHADE} opacity={0.26} />
  </g>
  <g opacity={0.6}>
    <path d="M22 10l-4-2-4 2 4 2z" style={SOLID} />
    <path d="M22 10l-4 2v6l4-2z" style={SOLID} />
    <path d="M18 12l-4-2v6l4 2z" style={SOLID} />
    <path d="M22 10l-4 2v6l4-2z" style={SHADE} opacity={0.26} />
  </g>
</Icon>;

/** The block's top front edge rounded, the round in teal. */
export const FilletIcon = ({ className }) => <Icon className={className}>
  <Block top="M3 10 11 6l8 4-6.4 3.2" right="M12.6 13.2 19 10v7l-8 4v-5.6" />
  <path d="M3 10l8 4v7l-8-4z" style={SOLID} />
  <path d="M3 10l8 4v7l-8-4z" style={SHADE} opacity={0.12} />
  <path d="M11 14c.4-.5 1-.8 1.6-.8L19 10" style={{ ...ACCENT, strokeWidth: 2.6 }} />
  <path d="M11 14c.6.3 1 .9 1 1.6V21" style={{ ...ACCENT, strokeWidth: 1.2 }} opacity={0.7} />
</Icon>;

/** The block's top front edge cut flat, the bevel in teal. */
export const ChamferIcon = ({ className }) => <Icon className={className}>
  <Block />
  <path d="M10.6 13.8 18.6 9.8l.4 2.6-8 4z" style={{ fill: "var(--cad-accent)", stroke: "var(--cad-solid-edge)", strokeWidth: 0.8, strokeLinejoin: "round" }} />
</Icon>;

/** The block hollowed out, open at the top. */
export const ShellIcon = ({ className }) => <Icon className={className}>
  <Block />
  <path d="M6 10 11 7.5 16 10 11 12.5z" style={SHADE} opacity={0.45} />
  <path d="M6 10 11 12.5 16 10" style={{ ...ACCENT, strokeWidth: 1.2 }} />
</Icon>;

// A tube's body along a path: its edge, then its fill, as thick strokes.
const TUBE_EDGE = Object.freeze({ fill: "none", stroke: "var(--cad-solid-edge)", strokeWidth: 6.6 });
const TUBE = Object.freeze({ fill: "none", stroke: "var(--cad-solid)", strokeWidth: 5 });
const SWEEP_PATH = "M5 21.5C5 12 9 7 19.5 7";

/** A round profile run along a curved path, the path dashed down its middle. */
export const SweptBossIcon = ({ className }) => <Icon className={className}>
  <path d={SWEEP_PATH} style={TUBE_EDGE} />
  <path d={SWEEP_PATH} style={TUBE} />
  <ellipse cx="19.5" cy="7" rx="1.3" ry="2.5" style={SOLID} />
  <path d={SWEEP_PATH} style={{ ...SKETCH, strokeWidth: 1 }} strokeDasharray="1.6 1.4" />
</Icon>;

/** A block with a curved groove run along its top, the groove in red. */
export const SweptCutIcon = ({ className }) => <Icon className={className}>
  <Block />
  <path d="M5.6 10.6C8 9.2 11 8 16 8.6" style={{ fill: "none", stroke: "var(--cad-cut)", strokeWidth: 2.4, strokeLinecap: "round" }} />
  <path d="M5.6 10.6C8 9.2 11 8 16 8.6" style={{ ...SKETCH, strokeWidth: 0.9 }} strokeDasharray="1.4 1.2" />
</Icon>;

/** A small profile below a large one, joined into one solid. */
export const LoftedBossIcon = ({ className }) => <Icon className={className}>
  <path d="M8.4 19.2 4 7h16l-4.4 12.2z" style={SOLID} />
  <path d="M12 19.2V7h8l-4.4 12.2z" style={SHADE} opacity={0.22} />
  <ellipse cx="12" cy="7" rx="8" ry="2.6" style={SOLID} />
  <ellipse cx="12" cy="19.2" rx="3.6" ry="1.2" style={{ ...SKETCH, strokeWidth: 1.1 }} />
</Icon>;

/** A block with a tapered pocket lofted down into it, the pocket in red. */
export const LoftedCutIcon = ({ className }) => <Icon className={className}>
  <Block />
  <path d="M6.6 10 11 7.8l4.4 2.2L11 12.2z" style={CUT} />
  <path d="M6.6 10 11 12.2l-.6 3.6-2.4-1.2z" style={CUT} opacity={0.65} />
</Icon>;

/** A channel with a thin rib standing across it, the rib in teal. */
export const RibIcon = ({ className }) => <Icon className={className}>
  <path d="M2 14 12 9l10 5-10 5z" style={SOLID} />
  <path d="M2 14v2.4l10 5V19z" style={SOLID} />
  <path d="M2 14v2.4l10 5V19z" style={SHADE} opacity={0.16} />
  <path d="M12 19v2.4l10-5V14z" style={SOLID} />
  <path d="M12 19v2.4l10-5V14z" style={SHADE} opacity={0.3} />
  <path d="M5 12.5V6.5l4-2v6M15 7.5v6l4-2v-6" style={{ ...SOLID, fill: "none" }} />
  <path d="m9.4 14.6 4-2v-6l-4 2z" style={{ fill: "var(--cad-accent)", stroke: "var(--cad-solid-edge)", strokeWidth: 0.8, strokeLinejoin: "round" }} />
</Icon>;

/** A block whose sides lean in toward its top, a drafted side in teal beside the upright it leans from. */
export const DraftIcon = ({ className }) => <Icon className={className}>
  <path d="M5 10 11 13v8l-8-4z" style={SOLID} />
  <path d="M5 10 11 13v8l-8-4z" style={SHADE} opacity={0.12} />
  <path d="M11 13 17 10l2 7-8 4z" style={{ fill: "var(--cad-accent)", stroke: "var(--cad-solid-edge)", strokeWidth: 0.8, strokeLinejoin: "round" }} />
  <path d="M5 10 11 7l6 3-6 3z" style={SOLID} />
  <path d="M19 17V8.5" style={{ ...ACCENT, strokeWidth: 1.1 }} strokeDasharray="1.6 1.3" />
</Icon>;

/** A plane in teal over the plane it is offset from, dashed, and the way it is offset. */
export const ReferencePlaneIcon = ({ className }) => <Icon className={className}>
  <path d="M2.5 19 7 14h14.5L17 19z" style={{ fill: "none", stroke: "var(--cad-solid-edge)", strokeWidth: 1.1 }} strokeDasharray="2 1.5" />
  <path d="M2.5 9.5 7 4.5h14.5L17 9.5z" style={{ fill: "var(--cad-accent)", stroke: "var(--cad-solid-edge)", strokeWidth: 1, strokeLinejoin: "round" }}
    opacity={0.85} />
  <Arrow d="M12 16.5V10" head="M10 12 12 10l2 2" />
</Icon>;

/** A ball in the part's color, lit from above, as SolidWorks draws Edit Appearance. */
export const AppearanceIcon = ({ className }) => <Icon className={className}>
  <defs>
    <radialGradient id="cad-appearance-ball" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
      <stop offset="0.35" stopColor="var(--cad-accent)" />
      <stop offset="1" stopColor="var(--cad-solid-edge)" />
    </radialGradient>
  </defs>
  <circle cx="12" cy="12" r="8.5" style={{ fill: "url(#cad-appearance-ball)", stroke: "var(--cad-solid-edge)", strokeWidth: 1 }} />
</Icon>;

/** A weight on a scale's pan, as Mass Properties is drawn: what the part weighs. */
export const DraftAnalysisIcon = ({ className }) => <Icon className={className}><path d="M4 20 7.5 5h9L20 20z" fill="#22c55e" fillOpacity=".25" /><path d="M4 20 7.5 5M20 20 16.5 5" stroke="#eab308" /><path d="M12 2v6M10 4l2-2 2 2" /></Icon>;
export const MassPropertiesIcon = ({ className }) => <Icon className={className}>
  <path d="M3 20h18" style={{ ...ACCENT, stroke: "var(--cad-solid-edge)", strokeWidth: 1.5 }} />
  <path d="M7.5 9h9l2.5 10H5z" style={SOLID} />
  <path d="M12 9v10h7z" style={SHADE} opacity={0.18} />
  <circle cx="12" cy="6" r="2.4" style={{ fill: "none", stroke: "var(--cad-solid-edge)", strokeWidth: 1.4 }} />
</Icon>;

/** Compare: a part as it was, outlined, and as it is now beside it, what it gained shaded. */
export const CompareIcon = ({ className }) => <Icon className={className}>
  <path d="M3 9h10v10H3z" style={{ fill: "none", stroke: "var(--cad-solid-edge)", strokeWidth: 1.25, strokeDasharray: "2 1.6" }} />
  <path d="M9 5h11v11H9z" style={SOLID} />
  <path d="M9 9h4v7H9z" style={CUT} opacity={0.75} />
</Icon>;

/** A drawing: a sheet with a view on it and its title block. */
export const DrawingIcon = ({ className }) => <Icon className={className}>
  <path d="M3 4h18v16H3z" style={{ fill: "var(--background)", stroke: "var(--cad-solid-edge)", strokeWidth: 1.25 }} />
  <path d="M6 7h6v6H6z" style={SOLID} />
  <path d="M14 15h7v5h-7z" style={{ fill: "none", stroke: "var(--cad-solid-edge)", strokeWidth: 1 }} />
  <path d="M6 15.5h5" style={ACCENT} />
</Icon>;

/** Edit Sheet: the drawing's sheet, a view on it, and a dimension being put on it. */
export const EditSheetIcon = ({ className }) => <Icon className={className}>
  <path d="M3 4h18v16H3z" style={{ fill: "var(--background)", stroke: "var(--cad-solid-edge)", strokeWidth: 1.25 }} />
  <path d="M7 11h8v6H7z" style={SOLID} />
  <path d="M7 6.5v2.5M15 6.5v2.5M7 7.75h8" style={ACCENT} />
</Icon>;

/** Mate: two parts brought together, the link between them. */
export const MateIcon = ({ className }) => <Icon className={className}>
  <path d="M3 13h8v7H3z" style={SOLID} />
  <path d="M13 5h8v7h-8z" style={SOLID} />
  <path d="M7 13v-2.5a3 3 0 0 1 3-3h3" style={ACCENT} />
  <path d="M17 12v2.5a3 3 0 0 1-3 3h-3" style={ACCENT} />
</Icon>;

/** A sketch on its plane, and the pencil drawing it. */
export const SketchIcon = ({ className }) => <Icon className={className}>
  <path d="M2 19 6 9h15l-4 10z" style={{ fill: "var(--cad-sketch)", stroke: "none" }} opacity={0.12} />
  <path d="M7 16.5 9 11h7" style={SKETCH} />
  <path d="m11 18 8.8-8.8 2 2L13 20l-2.6.6z" style={{ fill: "var(--cad-solid)", stroke: "var(--cad-solid-edge)", strokeWidth: 1, strokeLinejoin: "round" }} />
</Icon>;

/** A sketch finished: its lines, and a green check. */
export const ExitSketchIcon = ({ className }) => <Icon className={className}>
  <path d="M2 19 6 9h15l-4 10z" style={{ fill: "var(--cad-sketch)", stroke: "none" }} opacity={0.12} />
  <path d="M6.5 16.5 8.5 11h6" style={SKETCH} />
  <path d="m11.5 14.2 3 3.2 6.6-8.4" style={{ ...ACCENT, stroke: "var(--cad-ok)", strokeWidth: 2.4 }} />
</Icon>;

/** Each command's mark, in the ribbon and on its panel. */
export const COMMAND_ICONS = Object.freeze({
  extrude: ExtrudedBossIcon, cut: ExtrudedCutIcon, revolve: RevolvedBossIcon, revolve_cut: RevolvedCutIcon,
  sweep: SweptBossIcon, sweep_cut: SweptCutIcon, loft: LoftedBossIcon, loft_cut: LoftedCutIcon, rib: RibIcon,
  hole: HoleIcon, pattern: PatternIcon, mirror: MirrorIcon, fillet: FilletIcon, chamfer: ChamferIcon, shell: ShellIcon, draft: DraftIcon,
  plane: ReferencePlaneIcon,
});
