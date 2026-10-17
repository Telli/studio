import { Fragment, useLayoutEffect, useRef, useState } from "react";
import { ChevronsRight, Redo2, Undo2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@text-to-cad/ui/primitives/dropdown-menu";
import { TooltipHint } from "@text-to-cad/ui/primitives/tooltip";
import { cn } from "@text-to-cad/ui/utils";
import { FLOATING_SURFACE_CLASS } from "../../../lib/floatingSurface.js";
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
// The More button's box, before it is first laid out.
const MORE_WIDTH_PX = 54;

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

function RibbonGroup({ title, folded = false, children }) {
  return <div role="group" aria-label={title} aria-hidden={folded || undefined} data-cad-ribbon-group=""
    className={cn("flex shrink-0 flex-col items-center border-r border-border px-1 last:border-r-0", folded && "invisible")}>
    <div className="flex items-center gap-0.5 pt-1">{children}</div>
    <span className="pb-1 pt-0.5 text-micro uppercase leading-3 tracking-wider text-muted-foreground">{title}</span>
  </div>;
}

/**
 * How many of the ribbon's groups fit, the rest folded behind its More button as SolidWorks'
 * CommandManager folds its commands behind a chevron: whole groups, from the right. Measured as
 * laid out: a folded group keeps its place (unseen, past the edge), so each group's right edge
 * reads the same whichever are folded, and the count settles within a pass of the More button
 * appearing.
 */
function useRibbonFit(rowRef, moreRef, key) {
  const [fit, setFit] = useState(Infinity);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return undefined;
    const measure = () => {
      const groups = [...row.querySelectorAll(":scope > [data-cad-ribbon-group]")];
      const more = moreRef.current?.offsetWidth || 0;
      // The room the groups had with no More button beside them.
      const room = row.clientWidth + more + 1;
      const rights = groups.map(group => group.offsetLeft + group.offsetWidth);
      const all = rights.length && rights.at(-1) <= room;
      const next = all ? Infinity : rights.filter(right => right <= room - (more || MORE_WIDTH_PX)).length;
      setFit(current => (current === next ? current : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    for (const group of row.children) observer.observe(group);
    return () => observer.disconnect();
  }, [rowRef, moreRef, key]);
  return fit;
}

/** The groups that did not fit, as one menu: each group's title, then its commands. */
function MoreMenu({ groups }) {
  return <DropdownMenu modal={false}>
    <TooltipHint content="More commands">
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="More commands" className={cn(BUTTON_CLASS, "justify-center pt-0 aria-expanded:bg-sidebar-accent")}>
          <ChevronsRight aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
    </TooltipHint>
    {/* Closes with no exit animation, so a quick second press always reaches the button. */}
    <DropdownMenuContent align="end" sideOffset={4} collisionPadding={8} aria-label="More commands"
      className={cn(FLOATING_SURFACE_CLASS, "w-56 data-[state=closed]:animate-none!")}>
      {groups.map((group, index) => <Fragment key={group.title}>
        {index ? <DropdownMenuSeparator /> : null}
        <DropdownMenuLabel className="text-micro uppercase tracking-wider text-muted-foreground">{group.title}</DropdownMenuLabel>
        {group.items.map(item => typeof item.active === "boolean"
          ? <DropdownMenuCheckboxItem key={item.id} checked={item.active} disabled={item.disabled} onSelect={() => item.onClick()}>
            {item.icon}{item.label}
          </DropdownMenuCheckboxItem>
          : <DropdownMenuItem key={item.id} disabled={item.disabled} onSelect={() => item.onClick()}>{item.icon}{item.label}</DropdownMenuItem>)}
      </Fragment>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

/**
 * The ribbon's groups (`{ title, items }`, each item a button's `{ id, label, icon, active?,
 * disabled?, description?, onClick }`) in one row, and what does not fit in its More menu.
 */
function RibbonGroups({ groups, sketching = false }) {
  const rowRef = useRef(null);
  const moreRef = useRef(null);
  const key = groups.map(group => `${group.title}:${group.items.length}`).join("|") + (sketching ? "|sketch" : "");
  const fit = useRibbonFit(rowRef, moreRef, key);
  const folded = groups.slice(fit);
  return <>
    <div ref={rowRef} className="relative flex min-w-0 flex-1 items-stretch overflow-hidden">
      {groups.map((group, index) => <RibbonGroup key={group.title} title={group.title} folded={index >= fit}>
        {group.items.map(({ id, ...item }) => <RibbonButton key={id} {...item} sketching={sketching} />)}
      </RibbonGroup>)}
    </div>
    {folded.length ? <div ref={moreRef} className="flex shrink-0 flex-col items-center border-x border-border px-1" data-cad-ribbon-more="">
      <div className="flex items-center pt-1"><MoreMenu groups={folded} /></div>
      <span className="pb-1 pt-0.5 text-micro uppercase leading-3 tracking-wider text-muted-foreground">More</span>
    </div> : null}
  </>;
}

/**
 * Edit mode's ribbon, across the top of the viewer as a CAD tool's command bar: the edit's own
 * commands (Undo and Redo of the hand changes), Sketch (a new sketch, or Edit Sketch on the one
 * selected), the modeling commands (Create: Extruded and Revolved Boss/Base and Cut, Hole,
 * Pattern, Mirror; Modify: Fillet, Chamfer, Shell), each opening its panel at the viewer's left,
 * and the viewer's tools, which the strip over the model would otherwise hold, grouped as a CAD
 * tool groups them and named under their icons. While a sketch is edited it holds the sketch's
 * tools instead, as SolidWorks switches to its Sketch tab: Exit Sketch and Smart Dimension, the
 * entities to draw, Construction Geometry and Normal To, and the features to make of it. The
 * part's units and where its build stands, or the sketch and how defined it is, sit at its right
 * end. A narrow view keeps the icons and drops the names, then folds the groups at the right into
 * a More menu.
 *
 * @param {{ tools: import("../../kit/tools/FloatingToolBar.js").ViewportTool[],
 *   edit: ReturnType<typeof import("./useEditMode.js").useEditMode>, onCommand?: (id: string) => void,
 *   onSketch?: () => void, sketchLabel?: string }} props
 *   `onCommand` opens a command (the surface turns Select to what it picks); `onSketch` is the
 *   Sketch button (`sketchLabel`: "Edit Sketch" while a sketch is selected).
 */
export default function EditRibbon({ tools, edit, onCommand = id => edit.open(id), onSketch = () => edit.startPicking(), sketchLabel = "Sketch" }) {
  const byId = new Map(tools.map(tool => [tool.id, tool]));
  const grouped = new Set(GROUPS.flatMap(group => group.tools));
  const others = tools.filter(tool => !grouped.has(tool.id));
  const state = edit.state;
  const sketch = edit.sketch;
  const building = buildingText(state?.building);
  const status = edit.saving ? (sketch ? "Solving" : "Rebuilding")
    : building || (edit.status === "reading" ? "Reading the part" : edit.status === "ready" ? "Saved" : "");
  const commandsIdle = edit.status !== "ready" || edit.saving;
  const commandIcon = id => { const Icon = COMMAND_ICONS[id]; return <Icon aria-hidden="true" />; };
  const toolItem = tool => ({ id: tool.id, label: LABELS[tool.id] || tool.label, icon: tool.icon, active: tool.active === true,
    disabled: tool.disabled, description: tool.description, onClick: () => tool.onSelect() });
  const edits = { title: "Edit", items: [
    { id: "undo", label: "Undo", icon: <Undo2 aria-hidden="true" />, disabled: !edit.canUndo, onClick: () => void edit.undo() },
    { id: "redo", label: "Redo", icon: <Redo2 aria-hidden="true" />, disabled: !edit.canRedo, onClick: () => void edit.redo() },
  ] };
  const ribbon = (label, groups, end, sketching = false) => <div data-cad-ribbon="" data-cad-sketch-ribbon={sketching ? "" : undefined}
    className="@container/cad-ribbon flex min-h-0 shrink-0 items-stretch overflow-hidden border-b border-border bg-background" role="toolbar" aria-label={label}>
    <RibbonGroups groups={groups} sketching={sketching} />
    <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 px-2 text-tiny leading-4" aria-live="polite">{end}</div>
  </div>;

  if (sketch) {
    const tool = id => SKETCH_TOOLS.find(each => each.id === id);
    const sketchItem = each => {
      const Icon = SKETCH_TOOL_ICONS[each.id];
      const active = edit.sketchTool === each.id;
      return { id: each.id, label: each.label, icon: <Icon />, active, disabled: !sketch.state, onClick: () => edit.setSketchTool(active ? null : each.id) };
    };
    const curves = new Set((sketch.state?.curves || []).map(curve => curve.id));
    const chosen = edit.sketchSelection.filter(id => curves.has(id));
    const allConstruction = chosen.length > 0 && chosen.every(id => sketch.state.curves.find(curve => curve.id === id)?.construction);
    const sketchStatus = sketch.state?.status || "Not solved";
    return ribbon("Sketch", [
      edits,
      { title: "Sketch", items: [
        { id: "exit", label: "Exit Sketch", icon: <ExitSketchIcon />, disabled: edit.saving, onClick: () => void edit.exitSketch() },
        sketchItem(tool("dimension")),
      ] },
      { title: "Entities", items: SKETCH_ENTITIES.map(id => sketchItem(tool(id))) },
      { title: "Tools", items: [
        { id: "construction", label: "Construction Geometry", icon: <ConstructionIcon />, active: chosen.length ? allConstruction : edit.construction,
          disabled: !sketch.state || edit.saving,
          description: chosen.length ? "Makes the selected entities construction geometry, or no longer" : "Draws what comes next as construction geometry",
          onClick: () => (chosen.length ? void edit.sketchOp({ kind: "construction", items: chosen, on: !allConstruction })
            : edit.setConstruction(!edit.construction)) },
        { id: "normal", label: "Normal To", icon: <NormalToIcon />, onClick: edit.lookNormalTo },
      ] },
      { title: "Features", items: EDIT_COMMANDS.filter(command => command.sketch).map(command => ({
        id: command.id, label: command.label, icon: commandIcon(command.id), disabled: edit.saving || !sketch.state,
        onClick: async () => { const reply = await edit.exitSketch(); if (reply?.ok) onCommand(command.id); } })) },
    ], <>
      <span className="text-muted-foreground">{edit.saving ? "Solving" : `Editing ${sketch.name}`}</span>
      <span className={cn("text-micro", STATUS_CLASSES[sketchStatus] || "text-destructive")}>{sketchStatus}</span>
    </>, true);
  }

  const commandItem = command => {
    const open = edit.command === command.id;
    return { id: command.id, label: command.label, icon: commandIcon(command.id), active: open, disabled: commandsIdle,
      onClick: () => (open ? edit.close() : onCommand(command.id)) };
  };
  return ribbon("Design", [
    edits,
    { title: "Sketch", items: [{ id: "sketch", label: sketchLabel, icon: <SketchToolIcon />, active: edit.picking, disabled: commandsIdle,
      onClick: () => (edit.picking ? edit.stopPicking() : onSketch()) }] },
    ...["Create", "Modify"].map(title => ({ title, items: EDIT_COMMANDS.filter(command => command.group === title).map(commandItem) })),
    ...GROUPS.map(group => ({ title: group.title, items: group.tools.map(id => byId.get(id)).filter(Boolean).map(toolItem) })),
    { title: "Tools", items: others.map(toolItem) },
  ].filter(group => group.items.length), <>
    <span className={cn("text-muted-foreground", state?.building?.error && "text-destructive")}>{status}</span>
    {state?.units ? <span className="text-micro text-muted-foreground/80">{unitWord(state.units)}</span> : null}
  </>);
}
