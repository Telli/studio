import { Redo2, Undo2 } from "lucide-react";
import { TooltipHint } from "@text-to-cad/ui/primitives/tooltip";
import { cn } from "@text-to-cad/ui/utils";
import { buildingText, unitWord } from "./editMode.js";

// The viewer's tools in the ribbon's groups, by id, in the words a CAD tool uses (Clip is Section).
const GROUPS = Object.freeze([
  { title: "Select", tools: ["references"] },
  { title: "Inspect", tools: ["measure", "clip"] },
  { title: "Assemble", tools: ["exploded", "pose"] },
  { title: "Markup", tools: ["draw"] },
]);
const LABELS = Object.freeze({ clip: "Section", references: "Select" });
const BUTTON_CLASS = "flex h-12 min-w-11 flex-col items-center justify-center gap-1 rounded-md px-1.5 text-micro leading-none text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4";

function RibbonButton({ label, icon, active = false, disabled = false, description, onClick }) {
  return <TooltipHint content={label}>
    <button type="button" aria-label={label} aria-pressed={active} aria-description={description} disabled={disabled}
      className={cn(BUTTON_CLASS, active && "bg-sidebar-accent text-sidebar-accent-foreground")} onClick={onClick}>
      {icon}
      <span className="@max-xl/cad-ribbon:hidden">{label}</span>
    </button>
  </TooltipHint>;
}

function RibbonGroup({ title, children }) {
  return <div role="group" aria-label={title} className="flex shrink-0 flex-col items-center border-r border-border px-1 last:border-r-0">
    <div className="flex items-center gap-0.5 pt-1">{children}</div>
    <span className="pb-1 pt-0.5 text-micro uppercase leading-3 tracking-wider text-muted-foreground">{title}</span>
  </div>;
}

/**
 * Edit mode's ribbon, across the top of the viewer as a CAD tool's command bar: the edit's own
 * commands (Undo and Redo of the hand changes) and the viewer's tools, which the strip over the
 * model would otherwise hold, grouped as a CAD tool groups them and named under their icons. The
 * part's units and where its build stands sit at its right end. A narrow view keeps the icons and
 * drops the names.
 *
 * @param {{ tools: import("../../kit/tools/FloatingToolBar.js").ViewportTool[],
 *   edit: ReturnType<typeof import("./useEditMode.js").useEditMode> }} props
 */
export default function EditRibbon({ tools, edit }) {
  const byId = new Map(tools.map(tool => [tool.id, tool]));
  const groups = GROUPS.map(group => ({ ...group, tools: group.tools.map(id => byId.get(id)).filter(Boolean) })).filter(group => group.tools.length);
  const grouped = new Set(GROUPS.flatMap(group => group.tools));
  const others = tools.filter(tool => !grouped.has(tool.id));
  const state = edit.state;
  const building = buildingText(state?.building);
  const status = edit.saving ? "Rebuilding" : building || (edit.status === "reading" ? "Reading the part" : edit.status === "ready" ? "Saved" : "");
  const toolButton = tool => <RibbonButton key={tool.id} label={LABELS[tool.id] || tool.label} icon={tool.icon} active={tool.active === true}
    disabled={tool.disabled} description={tool.description} onClick={() => tool.onSelect()} />;
  return <div className="@container/cad-ribbon flex min-h-0 shrink-0 items-stretch overflow-hidden border-b border-border bg-background" data-cad-ribbon=""
    role="toolbar" aria-label="Design">
    <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
      <RibbonGroup title="Edit">
        <RibbonButton label="Undo" icon={<Undo2 aria-hidden="true" />} disabled={!edit.canUndo} onClick={() => void edit.undo()} />
        <RibbonButton label="Redo" icon={<Redo2 aria-hidden="true" />} disabled={!edit.canRedo} onClick={() => void edit.redo()} />
      </RibbonGroup>
      {groups.map(group => <RibbonGroup key={group.title} title={group.title}>{group.tools.map(toolButton)}</RibbonGroup>)}
      {others.length ? <RibbonGroup title="Tools">{others.map(toolButton)}</RibbonGroup> : null}
    </div>
    <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 px-2 text-tiny leading-4" aria-live="polite">
      <span className={cn("text-muted-foreground", state?.building?.error && "text-destructive")}>{status}</span>
      {state?.units ? <span className="text-micro text-muted-foreground/80">{unitWord(state.units)}</span> : null}
    </div>
  </div>;
}
