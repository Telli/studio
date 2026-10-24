/**
 * Edit mode's icons. The modeling commands' come from the icon generator (`scripts/nx-icons.py`,
 * drawn by `nxIcons.generated.jsx`); the panels' own are drawn here, 24 units square and sized by
 * the class given: material in amber (`--cad-solid`), material taken away in red (`--cad-cut`), a
 * sketch in blue (`--cad-sketch`), what the feature changes in teal (`--cad-accent`), as in
 * `styles/tokens.css`.
 */
import { NxIcon } from "./nxIcons.generated.jsx";

const SOLID = Object.freeze({ fill: "var(--cad-solid)", stroke: "var(--cad-solid-edge)", strokeWidth: 1, strokeLinejoin: "round" });
const SHADE = Object.freeze({ fill: "#000", stroke: "none" });
const CUT = Object.freeze({ fill: "var(--cad-cut)", stroke: "none" });
const ACCENT = Object.freeze({ fill: "none", stroke: "var(--cad-accent)", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" });
const SKETCH = Object.freeze({ fill: "none", stroke: "var(--cad-sketch)", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" });

function Icon({ className, children }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">{children}</svg>;
}

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
export const InterferenceIcon = ({ className }) => <Icon className={className}><rect x="3" y="9" width="11" height="11" rx="1" /><rect x="10" y="4" width="11" height="11" rx="1" /><path d="M10 9h4v6h-4z" fill="#ef4444" fillOpacity=".8" stroke="#ef4444" /></Icon>;
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
export const COMMAND_ICONS = Object.freeze(Object.fromEntries(Object.entries(COMMAND_ICON_NAMES)
  .map(([id, name]) => [id, ({ className }) => <NxIcon name={name} className={className} />])));
