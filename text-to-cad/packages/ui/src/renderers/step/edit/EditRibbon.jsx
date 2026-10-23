import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronsRight, LoaderCircle, Redo2, Undo2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@text-to-cad/ui/primitives/dropdown-menu";
import { Progress } from "@text-to-cad/ui/primitives/progress";
import { TooltipHint } from "@text-to-cad/ui/primitives/tooltip";
import { cn } from "@text-to-cad/ui/utils";
import { FLOATING_SURFACE_CLASS } from "../../../lib/floatingSurface.js";
import { AppearanceIcon, COMMAND_ICONS, CompareIcon, DraftAnalysisIcon, InterferenceIcon, DrawingIcon, EditSheetIcon, ExitSketchIcon, MassPropertiesIcon, MateIcon, SketchIcon } from "./cadIcons.jsx";
import { EDIT_COMMANDS, buildingText, busyState, unitWord } from "./editMode.js";
import { SKETCH_FAMILIES, SKETCH_TOOLS, sketchKey } from "./sketchMode.js";
import { ConstructionIcon, NormalToIcon, SKETCH_TOOL_ICONS } from "./sketchIcons.jsx";
import { NX_GROUPS, booleanOf, nxCommand } from "./nx.js";

// The viewer's tools the ribbon's tabs place, by id, under NX's names (Clip is NX's Edit Section).
const PLACED_TOOLS = Object.freeze(["references", "measure", "clip", "exploded", "annotate"]);
const LABELS = Object.freeze({ clip: "Edit Section", references: "Select", exploded: "Exploded Views" });
// A sketch tool family's button name, as NX's flyouts are named.
const FAMILY_NAMES = Object.freeze({ rectangle: "Rectangle", circle: "Circle", arc: "Arc", slot: "Slot", move_entities: "Move Curve" });
// Each command a picture large enough to tell apart, as SolidWorks' CommandManager draws its own:
// the modeling commands in their colors (`cadIcons.jsx`), the sketch tools in sketch blue, and the
// view's tools plain, as its view toolbar keeps them.
const BUTTON_CLASS = "flex h-[3.875rem] min-w-12 flex-col items-center justify-start gap-1 rounded-md px-1 pt-1.5 text-tiny leading-none text-sidebar-foreground/85 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-6 [&_svg]:shrink-0";
const SKETCH_TINT = "flex text-cad-sketch";
// A long name wraps to two lines under its icon, as SolidWorks' CommandManager sets them; without
// names (`compact`) the buttons narrow to their icons.
const LABEL_CLASS = "max-w-[4.75rem] whitespace-normal text-center leading-[1.1]";
// Sketch mode's tools, as SolidWorks' Sketch tab groups them: what draws, then what changes what is drawn.
// A family (`SKETCH_FAMILIES`) is one button and a flyout, by its first tool's id.
const SKETCH_ENTITIES = ["line", "rectangle", "circle", "arc", "slot", "polygon", "spline", "centerline", "point"];
const SKETCH_MODIFY = ["fillet", "chamfer", "trim", "extend", "convert", "intersection", "offset", "mirror", "move_entities", "linear_pattern", "circular_pattern"];
const STATUS_CLASSES = Object.freeze({ "Fully defined": "text-foreground", "Under defined": "text-blue-600 dark:text-blue-400",
  "Over defined": "text-red-600 dark:text-red-400" });
// The More button's box, before it is first laid out.
const MORE_WIDTH_PX = 46;
const ALL_NAMED = Object.freeze({ compact: false, count: Infinity });

function RibbonButton({ label, icon, active = false, disabled = false, description, onClick, compact = false, hint }) {
  return <TooltipHint content={hint || label}>
    <button type="button" aria-label={label} aria-pressed={active} aria-description={description} disabled={disabled}
      className={cn(BUTTON_CLASS, active && "bg-sidebar-accent text-sidebar-accent-foreground", compact && "min-w-9 justify-center pt-0")}
      onClick={onClick}>
      {icon}
      {compact ? null : <span className={LABEL_CLASS}>{label}</span>}
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
 * How the ribbon's groups fit, giving way as SolidWorks' CommandManager does: first the names go
 * (`compact`: the icons alone, each name in its tooltip), then whole groups fold from the right
 * behind the More button (`count`: the groups shown; Infinity, all of them). Each layout is
 * measured before it is painted. A folded group keeps its place, unseen past the edge, so each
 * group's right edge reads the same whichever are folded; the width the groups took with their
 * names is kept, to know when they fit again.
 */
function useRibbonFit(rowRef, moreRef, key) {
  const [fit, setFit] = useState(ALL_NAMED);
  const named = useRef(0);
  const measure = useCallback(() => {
    const row = rowRef.current;
    const groups = row ? [...row.querySelectorAll(":scope > [data-cad-ribbon-group]")] : [];
    if (!groups.length) return;
    const more = moreRef.current?.offsetWidth || 0;
    // The room the groups have with no More button beside them.
    const room = row.clientWidth + more + 1;
    const rights = groups.map(group => group.offsetLeft + group.offsetWidth);
    let next;
    if (row.dataset.compact !== "true") {
      named.current = rights.at(-1);
      next = named.current <= room ? ALL_NAMED : { compact: true, count: Infinity };
    } else if (!named.current || named.current <= room) {
      next = ALL_NAMED; // the names fit again, or their width is not known yet: shown to learn it
    } else {
      next = { compact: true, count: rights.at(-1) <= room ? Infinity : rights.filter(right => right <= room - (more || MORE_WIDTH_PX)).length };
    }
    setFit(current => (current.compact === next.compact && current.count === next.count ? current : next));
  }, [rowRef, moreRef]);
  // Other groups or names: their width with names is learnt again.
  useLayoutEffect(() => { named.current = 0; }, [key]);
  useLayoutEffect(measure, [measure, key, fit]);
  // A change in the room is measured on the next frame.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); });
    observer.observe(row);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [rowRef, measure]);
  return fit;
}

/** A sketch tool family's flyout, as SolidWorks' Sketch tab has them: a chevron after its button, its tools in a menu. */
function FamilyMenu({ label, items, onPick }) {
  return <DropdownMenu modal={false}>
    <TooltipHint content={`${label} tools`}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`${label} tools`}
          className="-ml-1 flex h-[3.875rem] w-3.5 shrink-0 items-start justify-center rounded-md pt-3 text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground aria-expanded:bg-sidebar-accent [&_svg]:size-3">
          <ChevronDown aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
    </TooltipHint>
    <DropdownMenuContent align="start" sideOffset={4} collisionPadding={8} aria-label={`${label} tools`}
      className={cn(FLOATING_SURFACE_CLASS, "w-60 data-[state=closed]:animate-none!")}>
      {items.map(item => <DropdownMenuCheckboxItem key={item.id} checked={item.active} disabled={item.disabled}
        onSelect={() => { onPick(item.id); item.onClick(); }}>{item.icon}{item.hint || item.label}</DropdownMenuCheckboxItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;
}

/** The groups that did not fit, as one menu: each group's title, then its commands. */
function MoreMenu({ groups }) {
  return <DropdownMenu modal={false}>
    <TooltipHint content="More commands">
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="More commands" className={cn(BUTTON_CLASS, "min-w-9 justify-center pt-0 aria-expanded:bg-sidebar-accent")}>
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
        {group.items.flatMap(item => item.variants || [item]).map(item => typeof item.active === "boolean"
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
 * disabled?, description?, menu?, onClick }`) in one row, and what does not fit in its More menu.
 */
function RibbonGroups({ groups }) {
  const rowRef = useRef(null);
  const moreRef = useRef(null);
  const key = groups.map(group => `${group.title}:${group.items.map(item => item.label).join(",")}`).join("|");
  const fit = useRibbonFit(rowRef, moreRef, key);
  const folded = groups.slice(fit.count);
  return <>
    <div ref={rowRef} data-compact={fit.compact ? "true" : "false"} className="relative flex min-w-0 flex-1 items-stretch overflow-hidden">
      {groups.map((group, index) => <RibbonGroup key={group.title} title={group.title} folded={index >= fit.count}>
        {/* A tool's settings (Select's filter) are its chevron after its button, as on the strip. */}
        {group.items.map(({ id, menu, ...item }) => <Fragment key={id}><RibbonButton {...item} compact={fit.compact} />{menu || null}</Fragment>)}
      </RibbonGroup>)}
    </div>
    {folded.length ? <div ref={moreRef} className="flex shrink-0 flex-col items-center border-x border-border px-1" data-cad-ribbon-more="">
      <div className="flex items-center pt-1"><MoreMenu groups={folded} /></div>
      <span className="pb-1 pt-0.5 text-micro uppercase leading-3 tracking-wider text-muted-foreground">More</span>
    </div> : null}
  </>;
}

/**
 * Edit mode's ribbon, across the top of the viewer as NX's: its tabs along the top, each with Undo
 * and Redo of the hand changes first. Home holds the selection, Sketch (a new sketch, or Edit
 * Sketch on the one selected) and the modeling commands in NX's groups and names (Feature:
 * Extrude, Revolve, Hole...; Detail Feature: Edge Blend, Chamfer...), each opening its dialog;
 * Analysis, View, Assemblies and Drafting hold the rest, and the viewer's tools the strip over the
 * model would otherwise hold. While a sketch is edited it holds the sketch's tools instead, as
 * NX's sketch task environment does: Finish Sketch, the curves to draw and edit (Quick Trim,
 * Offset Curve...), Rapid Dimension, and the features to make of it. The part's units and where
 * its build stands, or the sketch and how defined it is, sit at its right end. A narrow view keeps
 * the icons and drops the names, then folds the groups at the right into a More menu.
 *
 * @param {{ tools: import("../../kit/tools/FloatingToolBar.js").ViewportTool[],
 *   edit: ReturnType<typeof import("./useEditMode.js").useEditMode>, onCommand?: (id: string) => void,
 *   onSketch?: () => void, sketchLabel?: string, onNormalTo?: (() => void) | null }} props
 *   `onCommand` opens a command (the surface turns Select to what it picks); `onSketch` is the
 *   Sketch button (`sketchLabel`: "Edit Sketch" while a sketch is selected).
 */
export default function EditRibbon({ tools, edit, onCommand = id => edit.open(id), onSketch = () => edit.startPicking(), sketchLabel = "Sketch",
  canOpenParts = false, onNormalTo = null }) {
  const byId = new Map(tools.map(tool => [tool.id, tool]));
  const placedTools = new Set(PLACED_TOOLS);
  const others = tools.filter(tool => !placedTools.has(tool.id));
  // The ribbon tab in front, as NX keeps it while the part is open.
  const [tab, setTab] = useState("home");
  const state = edit.state;
  const sketch = edit.sketch;
  // Each sketch tool family's tool last picked from its flyout, shown as its button.
  const [lastOfFamily, setLastOfFamily] = useState({});
  // What it is busy with, said with a spinner and a line along the ribbon's foot, as a CAD tool's
  // status bar shows a rebuild: never a word alone that could be a label.
  const busy = busyState(edit);
  const status = busy?.text || buildingText(state?.building) || (edit.status === "ready" ? "Saved" : "");
  const commandsIdle = edit.status !== "ready" || edit.saving || edit.rolling;
  // An assembly places its parts: a part is modeled on its own, opened from the design tree, as
  // SolidWorks models a part in its own window.
  const placing = Boolean(edit.state?.components?.length);
  const modelingOff = commandsIdle || placing;
  const placingWords = !placing ? undefined : canOpenParts
    ? "An assembly places its parts. Double-click a part in the Part Navigator to open it and model it."
    : "An assembly places its parts. Ask the agent to change a part.";
  const commandIcon = id => { const Icon = COMMAND_ICONS[id]; return <Icon aria-hidden="true" />; };
  const toolItem = tool => ({ id: tool.id, label: LABELS[tool.id] || tool.label, icon: tool.icon, active: tool.active === true,
    disabled: tool.disabled, description: tool.description, menu: tool.menu, onClick: () => tool.onSelect() });
  const edits = { title: "Edit", items: [
    { id: "undo", label: "Undo", icon: <Undo2 aria-hidden="true" />, disabled: !edit.canUndo, onClick: () => void edit.undo() },
    { id: "redo", label: "Redo", icon: <Redo2 aria-hidden="true" />, disabled: !edit.canRedo, onClick: () => void edit.redo() },
  ] };
  // NX's ribbon: its tabs along the top (Home, Analysis, View...), the tab in front's groups under them.
  const tabRow = (list, active, onPick) => <div role="tablist" aria-label="Ribbon tabs" data-cad-ribbon-tabs=""
    className="flex h-6 shrink-0 items-end gap-0.5 border-b border-border px-1.5">
    {list.map(each => <button key={each.id} type="button" role="tab" aria-selected={each.id === active}
      className={cn("h-full rounded-t-md px-2.5 text-tiny leading-none text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45",
        each.id === active && "bg-sidebar-accent font-medium text-foreground")}
      onClick={() => onPick(each.id)}>{each.title}</button>)}
  </div>;
  const ribbon = (label, groups, end, sketching = false, tabs = null, key = label) => <div data-cad-ribbon="" data-cad-sketch-ribbon={sketching ? "" : undefined}
    aria-busy={busy ? true : undefined}
    className="relative flex min-h-0 shrink-0 flex-col overflow-hidden border-b border-border bg-background" role="toolbar" aria-label={label}>
    {tabs}
    <div className="flex min-h-0 items-stretch overflow-hidden">
      <RibbonGroups key={key} groups={groups} />
      <div className="flex shrink-0 flex-col items-end justify-center gap-0.5 px-2 text-tiny leading-4" aria-live="polite">{end}</div>
    </div>
    {busy ? <Progress value={busy.progress} className="absolute inset-x-0 bottom-0" aria-label={busy.text} /> : null}
  </div>;
  const statusLine = (text, failed = false) => <span className={cn("flex items-center gap-1",
    busy ? "text-foreground" : failed ? "text-destructive" : "text-muted-foreground")}>
    {busy ? <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-hidden="true" /> : null}{text}
  </span>;

  if (sketch) {
    const tool = id => SKETCH_TOOLS.find(each => each.id === id);
    const sketchItem = each => {
      const Icon = SKETCH_TOOL_ICONS[each.id];
      const active = edit.sketchTool === each.id;
      const onClick = () => {
        // Entities selected with the line to mirror them about last: mirrored at once, as SolidWorks does.
        const picked = edit.sketchSelection;
        const about = (sketch.state?.curves || []).find(curve => curve.id === picked.at(-1));
        if (each.id === "mirror" && !active && picked.length > 1 && about?.kind === "line" && !about.derived) {
          void edit.sketchOp({ kind: "mirror", items: picked.slice(0, -1), about: about.id }).then(reply => { if (reply?.ok) edit.selectInSketch([]); });
          return;
        }
        edit.setSketchTool(active ? null : each.id);
      };
      const key = sketchKey(each.id);
      return { id: each.id, label: each.label, hint: key ? `${each.label} (${key})` : undefined, icon: <span className={SKETCH_TINT}><Icon /></span>,
        active, disabled: !sketch.state || edit.saving, onClick };
    };
    // A tool, or a family's button (the tool in hand of it, else the one last picked of it) with its flyout.
    const familyItem = id => {
      const family = SKETCH_FAMILIES[id];
      if (!family) return sketchItem(tool(id));
      const shown = family.includes(edit.sketchTool) ? edit.sketchTool : lastOfFamily[id] || id;
      const variants = family.map(each => sketchItem(tool(each)));
      const pick = each => setLastOfFamily(current => ({ ...current, [id]: each }));
      const name = FAMILY_NAMES[id] || tool(id).label;
      return { ...sketchItem(tool(shown)), id, variants, menu: <FamilyMenu label={name} items={variants} onPick={pick} /> };
    };
    const curves = new Set((sketch.state?.curves || []).map(curve => curve.id));
    const chosen = edit.sketchSelection.filter(id => curves.has(id));
    const allConstruction = chosen.length > 0 && chosen.every(id => sketch.state.curves.find(curve => curve.id === id)?.construction);
    const sketchStatus = sketch.state?.status || "Not solved";
    return ribbon("Sketch", [
      edits,
      { title: "Sketch", items: [
        { id: "exit", label: "Finish Sketch", icon: <ExitSketchIcon />, disabled: edit.saving, onClick: () => void edit.exitSketch() },
        { id: "normal", label: "Orient View to Sketch", icon: <span className={SKETCH_TINT}><NormalToIcon /></span>, onClick: edit.lookNormalTo },
      ] },
      { title: "Curve", items: SKETCH_ENTITIES.map(id => familyItem(id)) },
      { title: "Edit Curve", items: SKETCH_MODIFY.map(id => familyItem(id)) },
      { title: "Constraints", items: [
        sketchItem(tool("dimension")),
        { id: "construction", label: "Convert To/From Reference", hint: "Convert To/From Reference (X)", icon: <span className={SKETCH_TINT}><ConstructionIcon /></span>,
          active: chosen.length ? allConstruction : edit.construction,
          disabled: !sketch.state || edit.saving,
          description: chosen.length ? "Makes the selected entities construction geometry, or no longer" : "Draws what comes next as construction geometry",
          onClick: () => (chosen.length ? void edit.sketchOp({ kind: "construction", items: chosen, on: !allConstruction })
            : edit.setConstruction(!edit.construction)) },
      ] },
      // The features to make of it, as NX names them; each subtracts by its Boolean in its dialog.
      { title: "Feature", items: EDIT_COMMANDS.filter(command => (command.sketch || command.sketches) && booleanOf(command.id)?.value !== "subtract")
        .map(command => ({ id: command.id, label: nxCommand(command), icon: commandIcon(command.id), disabled: edit.saving || !sketch.state,
          onClick: async () => { const reply = await edit.exitSketch(); if (reply?.ok) onCommand(command.id); } })) },
    ], <>
      {statusLine(edit.saving ? "Solving" : `Editing ${sketch.name}`)}
      <span className={cn("text-micro", STATUS_CLASSES[sketchStatus] || "text-destructive")}>{sketchStatus}</span>
    </>, true, tabRow([{ id: "sketch", title: "Sketch" }], "sketch", () => {}));
  }

  const commandItem = command => {
    const open = edit.command === command.id || edit.command === booleanOf(command.id)?.other;
    return { id: command.id, label: nxCommand(command), icon: commandIcon(command.id), active: open, disabled: modelingOff,
      description: placingWords, onClick: () => (open ? edit.close() : onCommand(command.id)) };
  };
  // A panel the ribbon opens beside the tree (Measure Bodies, Draft Analysis...), and closes again.
  const panelItem = (id, label, icon, what, disabled = edit.status !== "ready") => ({ id, label, icon, active: edit.inspecting === what, disabled,
    onClick: () => (edit.inspecting === what ? edit.stopInspecting() : edit.inspect(what)) });
  const viewerTool = id => (byId.has(id) ? [toolItem(byId.get(id))] : []);
  const drawing = placing ? [] : state?.drawing ? [
    panelItem("drawing", "Drawing", <DrawingIcon />, "drawing"),
    { id: "edit-sheet", label: "Edit Sheet", icon: <EditSheetIcon />, active: Boolean(edit.sheetView), disabled: edit.status !== "ready",
      onClick: () => (edit.sheetView ? edit.closeSheet() : void edit.openSheet(1)) }]
    : [{ id: "make-drawing", label: "New Sheet", icon: <DrawingIcon />, disabled: edit.status !== "ready" || edit.saving,
      onClick: async () => { const reply = await edit.drawing({ make: true }); if (reply?.ok) edit.inspect("drawing"); } }];
  // NX's tabs, each with Undo and Redo first as its Quick Access Toolbar keeps them.
  const tabs = [
    // Home: the selection, a sketch, and the modeling commands in NX's groups (Feature, Detail Feature...).
    { id: "home", title: "Home", groups: [
      edits,
      { title: "Selection", items: viewerTool("references") },
      { title: "Direct Sketch", items: [{ id: "sketch", label: sketchLabel, icon: <SketchIcon />, active: edit.picking, disabled: modelingOff,
        description: placingWords, onClick: () => (edit.picking ? edit.stopPicking() : onSketch()) }] },
      ...NX_GROUPS.map(group => ({ title: group.title, items: group.commands.map(id => EDIT_COMMANDS.find(command => command.id === id))
        .filter(Boolean).map(commandItem) })),
    ] },
    // Analysis: what measures and checks the part.
    { id: "analysis", title: "Analysis", groups: [
      edits,
      { title: "Measure", items: [...viewerTool("measure"), panelItem("mass", "Measure Bodies", <MassPropertiesIcon aria-hidden="true" />, "mass")] },
      { title: "Shape", items: placing ? [] : [panelItem("draft-analysis", "Draft Analysis", <DraftAnalysisIcon aria-hidden="true" />, "draft")] },
      { title: "Check", items: [panelItem("interference", "Simple Interference", <InterferenceIcon aria-hidden="true" />, "interference"),
        ...(placing ? [] : [panelItem("compare", "Compare", <CompareIcon aria-hidden="true" />, "compare")])] },
    ] },
    // View: how the part is seen.
    { id: "view", title: "View", groups: [
      edits,
      { title: "Orientation", items: [{ id: "normal-to", label: "Orient View", icon: <span className={SKETCH_TINT}><NormalToIcon /></span>,
        disabled: !onNormalTo, hint: "Orient View: look straight at the face or plane selected",
        description: onNormalTo ? undefined : "Select a flat face, or a plane in the Part Navigator, to look straight at it.",
        onClick: () => onNormalTo?.() }] },
      { title: "Visibility", items: viewerTool("clip") },
      { title: "Display", items: placing ? [] : [panelItem("appearance", "Edit Object Display", <AppearanceIcon />, "appearance")] },
      { title: "Markup", items: viewerTool("annotate") },
      { title: "Tools", items: others.map(toolItem) },
    ] },
    // Assemblies: an assembly's parts placed by Assembly Constraints, and its exploded views.
    { id: "assemblies", title: "Assemblies", groups: [
      edits,
      { title: "Constraints", items: placing ? [panelItem("mate", "Assembly Constraints", <MateIcon aria-hidden="true" />, "mate",
        edit.status !== "ready" || edit.saving)] : [] },
      { title: "Exploded Views", items: viewerTool("exploded") },
    ] },
    // Drafting: the part's drawing.
    { id: "drafting", title: "Drafting", groups: [edits, { title: "Sheet", items: drawing }] },
  ].map(each => ({ ...each, groups: each.groups.filter(group => group.items.length) }))
    // A tab with nothing but Undo and Redo is not offered.
    .filter(each => each.groups.some(group => group !== edits));
  const front = tabs.find(each => each.id === tab) || tabs[0];
  return ribbon("Design", front.groups, <>
    {statusLine(status, Boolean(state?.building?.error))}
    {state?.units ? <span className="text-micro text-muted-foreground/80">{unitWord(state.units)}</span> : null}
  </>, false, tabRow(tabs, front.id, setTab), `Design:${front.id}`);
}
