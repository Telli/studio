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
  hole: HoleIcon, pattern: PatternIcon, mirror: MirrorIcon, fillet: FilletIcon, chamfer: ChamferIcon, shell: ShellIcon,
});
