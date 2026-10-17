import { Redo2, Undo2 } from "lucide-react";
import { TooltipHint } from "@text-to-cad/ui/primitives/tooltip";
import { cn } from "@text-to-cad/ui/utils";
import { COMMAND_ICONS } from "./EditCommand.jsx";
import { EDIT_COMMANDS, buildingText, unitWord } from "./editMode.js";
import { SKETCH_TOOLS } from "./sketchMode.js";
import {
  ConstructionIcon,
  ExitSketchIcon,
  NormalToIcon,
  SKETCH_TOOL_ICONS,
  SketchToolIcon
} from "./sketchIcons.jsx";

// The viewer's tools in the ribbon's groups, by id, in the words a CAD tool uses (Clip is Section).
const GROUPS = Object.freeze([
  { title: "Select", tools: ["references"] },
  { title: "Inspect", tools: ["measure", "clip"] },
  { title: "Assemble", tools: ["exploded", "pose"] },
  { title: "Markup", tools: ["draw"] },
]);
const LABELS = Object.freeze({ clip: "Section", references: "Select" });
const BUTTON_CLASS = "flex h-[3.25rem] min-w-11 flex-col items-center justify-start gap-1 rounded-md px-1 pt-1.5 text-micro leading-none text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0";
// A long name wraps to two lines under its icon, as SolidWorks' CommandManager sets them; a
// narrow ribbon keeps the icons (their names in tooltips). The sketch tab, with more tools, does
// so sooner.
const LABEL_CLASS = "max-w-[4.75rem] whitespace-normal text-center leading-[1.1] @max-xl/cad-ribbon:hidden";
const SKETCH_LABEL_CLASS = "max-w-[4.75rem] whitespace-normal text-center leading-[1.1] @max-7xl/cad-ribbon:hidden";
// Sketch mode's tools, as SolidWorks' Sketch tab groups them.
const SKETCH_ENTITIES = ["line", "rectangle", "center_rectangle", "circle", "arc", "slot", "centerline", "point"];
const STATUS_CLASSES = Object.freeze({ "Fully defined": "text-foreground", "Under defined": "text-blue-600 dark:text-blue-400",
  "Over defined": "text-red-600 dark:text-red-400" });

function RibbonButton({ label, icon, active = false, disabled = false, description, onClick, sketching = false }) {
  return <TooltipHint content={label}>
    <button type="button" aria-label={label} aria-pressed={active} aria-description={description} disabled={disabled}
      className={cn(BUTTON_CLASS, active && "bg-sidebar-accent text-sidebar-accent-foreground", sketching && "@max-7xl/cad-ribbon:justify-center @max-7xl/cad-ribbon:pt-0")}
      onClick={onClick}>
      {icon}
      <span className={sketching ? SKETCH_LABEL_CLASS : LABEL_CLASS}>{label}</span>
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
 * commands (Undo and Redo of the hand changes), Sketch (a new sketch, or Edit Sketch on the one
 * selected), the modeling commands (Create: Extruded Boss/Base, Extruded Cut, Hole, Pattern,
 * Mirror; Modify: Fillet, Chamfer, Shell), each opening its panel at the viewer's left, and the
 * viewer's tools, which the strip over the model would otherwise hold, grouped as a CAD tool
 * groups them and named under their icons. While a sketch is edited it holds the sketch's tools
 * instead, as SolidWorks switches to its Sketch tab: Exit Sketch and Smart Dimension, the
 * entities to draw, Construction Geometry and Normal To, and the features to make of it. The
 * part's units and where its build stands, or the sketch and how defined it is, sit at its right
 * end. A narrow view keeps the icons and drops the names.
 *
 * @param {{ tools: import("../../kit/tools/FloatingToolBar.js").ViewportTool[],
 *   edit: ReturnType<typeof import("./useEditMode.js").useEditMode>, onCommand?: (id: string) => void,
 *   onSketch?: () => void, sketchLabel?: string }} props
 *   `onCommand` opens a command (the surface turns Select to what it picks); `onSketch` is the
 *   Sketch button (`sketchLabel`: "Edit Sketch" while a sketch is selected).
 */
export default function EditRibbon({ tools, edit, onCommand = id => edit.open(id), onSketch = () => edit.startPicking(), sketchLabel = "Sketch" }) {
  const byId = new Map(tools.map(tool => [tool.id, tool]));
  const groups = GROUPS.map(group => ({ ...group, tools: group.tools.map(id => byId.get(id)).filter(Boolean) })).filter(group => group.tools.length);
  const grouped = new Set(GROUPS.flatMap(group => group.tools));
  const others = tools.filter(tool => !grouped.has(tool.id));
  const state = edit.state;
  const sketch = edit.sketch;
  const building = buildingText(state?.building);
  const status = edit.saving ? (sketch ? "Solving" : "Rebuilding")
    : building || (edit.status === "reading" ? "Reading the part" : edit.status === "ready" ? "Saved" : "");
  const commandsIdle = edit.status !== "ready" || edit.saving;
  const commandButton = command => {
    const Icon = COMMAND_ICONS[command.id];
    const open = edit.command === command.id;
    return <RibbonButton key={command.id} label={command.label} icon={<Icon aria-hidden="true" />} active={open}
      disabled={commandsIdle} onClick={() => (open ? edit.close() : onCommand(command.id))} />;
  };
  const toolButton = tool => <RibbonButton key={tool.id} label={LABELS[tool.id] || tool.label} icon={tool.icon} active={tool.active === true}
    disabled={tool.disabled} description={tool.description} onClick={() => tool.onSelect()} />;
  const edits = <RibbonGroup title="Edit">
    <RibbonButton label="Undo" icon={<Undo2 aria-hidden="true" />} disabled={!edit.canUndo} sketching={Boolean(sketch)} onClick={() => void edit.undo()} />
    <RibbonButton label="Redo" icon={<Redo2 aria-hidden="true" />} disabled={!edit.canRedo} sketching={Boolean(sketch)} onClick={() => void edit.redo()} />
  </RibbonGroup>;

  if (sketch) {
    const sketchButton = tool => {
      const Icon = SKETCH_TOOL_ICONS[tool.id];
      const active = edit.sketchTool === tool.id;
      return <RibbonButton key={tool.id} label={tool.label} icon={<Icon />} active={active} disabled={!sketch.state} sketching
        onClick={() => edit.setSketchTool(active ? null : tool.id)} />;
    };
    const tool = id => SKETCH_TOOLS.find(each => each.id === id);
    const curves = new Set((sketch.state?.curves || []).map(curve => curve.id));
    const chosen = edit.sketchSelection.filter(id => curves.has(id));
    const allConstruction = chosen.length > 0 && chosen.every(id => sketch.state.curves.find(curve => curve.id === id)?.construction);
    const sketchStatus = sketch.state?.status || "Not solved";
    return <div className="@container/cad-ribbon flex min-h-0 shrink-0 items-stretch overflow-hidden border-b border-border bg-background" data-cad-ribbon=""
      data-cad-sketch-ribbon="" role="toolbar" aria-label="Sketch">
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        {edits}
        <RibbonGroup title="Sketch">
          <RibbonButton label="Exit Sketch" icon={<ExitSketchIcon />} disabled={edit.saving} sketching onClick={() => void edit.exitSketch()} />
          {sketchButton(tool("dimension"))}
        </RibbonGroup>
        <RibbonGroup title="Entities">{SKETCH_ENTITIES.map(id => sketchButton(tool(id)))}</RibbonGroup>
        <RibbonGroup title="Tools">
          <RibbonButton label="Construction Geometry" icon={<ConstructionIcon />} sketching
            active={chosen.length ? allConstruction : edit.construction} disabled={!sketch.state || edit.saving}
            description={chosen.length ? "Makes the selected entities construction geometry, or no longer" : "Draws what comes next as construction geometry"}
            onClick={() => (chosen.length ? void edit.sketchOp({ kind: "construction", items: chosen, on: !allConstruction })
              : edit.setConstruction(!edit.construction))} />
          <RibbonButton label="Normal To" icon={<NormalToIcon />} sketching onClick={edit.lookNormalTo} />
        </RibbonGroup>
        <RibbonGroup title="Features">
          {EDIT_COMMANDS.filter(command => command.sketch).map(command => {
            const Icon = COMMAND_ICONS[command.id];
            return <RibbonButton key={command.id} label={command.label} icon={<Icon aria-hidden="true" />} disabled={edit.saving || !sketch.state} sketching
              onClick={async () => { const reply = await edit.exitSketch(); if (reply?.ok) onCommand(command.id); }} />;
          })}
        </RibbonGroup>
      </div>
      <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 px-2 text-tiny leading-4" aria-live="polite">
        <span className="text-muted-foreground">{edit.saving ? "Solving" : `Editing ${sketch.name}`}</span>
        <span className={cn("text-micro", STATUS_CLASSES[sketchStatus] || "text-destructive")}>{sketchStatus}</span>
      </div>
    </div>;
  }

  return <div className="@container/cad-ribbon flex min-h-0 shrink-0 items-stretch overflow-hidden border-b border-border bg-background" data-cad-ribbon=""
    role="toolbar" aria-label="Design">
    <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
      {edits}
      <RibbonGroup title="Sketch">
        <RibbonButton label={sketchLabel} icon={<SketchToolIcon />} active={edit.picking} disabled={commandsIdle}
          onClick={() => (edit.picking ? edit.stopPicking() : onSketch())} />
      </RibbonGroup>
      {["Create", "Modify"].map(title => <RibbonGroup key={title} title={title}>
        {EDIT_COMMANDS.filter(command => command.group === title).map(commandButton)}
      </RibbonGroup>)}
      {groups.map(group => <RibbonGroup key={group.title} title={group.title}>{group.tools.map(toolButton)}</RibbonGroup>)}
      {others.length ? <RibbonGroup title="Tools">{others.map(toolButton)}</RibbonGroup> : null}
    </div>
    <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 px-2 text-tiny leading-4" aria-live="polite">
      <span className={cn("text-muted-foreground", state?.building?.error && "text-destructive")}>{status}</span>
      {state?.units ? <span className="text-micro text-muted-foreground/80">{unitWord(state.units)}</span> : null}
    </div>
  </div>;
}
