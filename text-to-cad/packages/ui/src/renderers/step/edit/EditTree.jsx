import { useEffect, useRef, useState } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@text-to-cad/ui/primitives/context-menu";
import { TREE_INDENT_PX, TreeRowChevron, TreeRowSurface } from "@text-to-cad/ui/primitives/tree-row";
import { FileSheetValueInput } from "../../kit/inspector/FileSheet.js";
import { ORIGIN_PLANES, barIndex, rolledBack, sizeName, treeFeatures } from "./editMode.js";
import { AssemblyIcon, FeatureIcon, OriginIcon, ParametersIcon, PartIcon, PlaneIcon, SketchIcon } from "./featureIcons.jsx";

const UNIT_MARKS = Object.freeze({ mm: "mm", in: "in" });
// How defined a sketch is, marked before its name as SolidWorks marks it: (-) under, (+) over.
const SKETCH_MARKS = Object.freeze({ "Under defined": "(-) ", "Over defined": "(+) " });

/** One row of the tree: its place (depth), its disclosure when it has rows under it, its icon and
 * name. A double-click opens it (`onActivate`: Edit Sketch on a sketch, Edit Feature on a feature),
 * else opens or closes it; a right-click selects it and opens its menu (`menu`: Edit Feature, Edit
 * Sketch, Suppress or Unsuppress, Delete), as SolidWorks' does. */
function Row({ id, depth, icon, title, detail = "", expanded = null, onToggle = null, onActivate = null, selected, onSelect, onHover, muted = false, menu = null,
  slot = null }) {
  const active = Boolean(id) && selected === id;
  const row = <TreeRowSurface as="div" dense active={active} role="treeitem" aria-selected={active}
    aria-expanded={expanded === null ? undefined : expanded} tabIndex={-1}
    className="cursor-default select-none" style={{ paddingLeft: 4 + depth * (TREE_INDENT_PX + 2) }}
    data-cad-edit-tree-row={id || title} data-cad-edit-bar-slot={slot ?? undefined}
    onClick={() => { if (id) onSelect(id); else onToggle?.(); }}
    onContextMenu={() => { if (id && menu?.length) onSelect(id); }}
    onDoubleClick={() => (onActivate ? onActivate() : onToggle?.())}
    onPointerEnter={() => onHover(id || null)} onPointerLeave={() => onHover(null)}>
    <span className="flex w-3 shrink-0 justify-center" onClick={event => { if (onToggle) { event.stopPropagation(); onToggle(); } }}>
      <TreeRowChevron expanded={Boolean(expanded)} branch={expanded !== null} />
    </span>
    {icon}
    <span className={muted ? "truncate text-muted-foreground" : "truncate"}>{title}</span>
    {detail ? <span className="ml-auto truncate pl-2 text-muted-foreground">{detail}</span> : null}
  </TreeRowSurface>;
  if (!menu?.length) return row;
  return <ContextMenu>
    <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
    <ContextMenuContent className="w-44">
      {menu.map(item => [item.separatorBefore ? <ContextMenuSeparator key={`${item.id}:separator`} /> : null,
        <ContextMenuItem key={item.id} disabled={item.disabled} variant={item.destructive ? "destructive" : "default"} onSelect={item.onSelect}>
          {item.label}
        </ContextMenuItem>])}
    </ContextMenuContent>
  </ContextMenu>;
}

/**
 * The rollback bar, as SolidWorks draws it under a part's features: dragged up between them (or
 * moved a row at a time with the arrow keys) to show the part as it was there. `index` is the item
 * it is above (`count`: past the last). While dragged it stays put and `onPreview` says where it
 * would go (`slotAt`: the place under the pointer); `onMove` places it.
 */
function RollbackBar({ index, count, label, disabled, slotAt, onPreview, onMove }) {
  const drag = useRef(null);
  const place = target => Math.max(1, Math.min(count, target));
  return <div role="slider" aria-label="Rollback bar" aria-orientation="vertical" aria-valuemin={1} aria-valuemax={count}
    aria-valuenow={index} aria-valuetext={label} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
    title="Rollback bar: drag it up to see the part as it was there"
    className={`group flex h-3 shrink-0 touch-none items-center px-2 focus-visible:outline-none ${disabled ? "cursor-default opacity-50" : "cursor-grab active:cursor-grabbing"}`}
    data-cad-edit-rollback-bar=""
    onPointerDown={event => {
      if (disabled || event.button !== 0) return;
      // No text selection while dragging; focus taken by hand, so the arrow keys move it after a click.
      event.preventDefault();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { from: index, at: index };
    }}
    onPointerMove={event => {
      if (!drag.current) return;
      const at = place(slotAt(event.clientY));
      if (at !== drag.current.at) { drag.current.at = at; onPreview(at === drag.current.from ? null : at); }
    }}
    onPointerUp={event => {
      if (!drag.current) return;
      const { from, at } = drag.current;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      onPreview(null);
      if (at !== from) onMove(at);
    }}
    onPointerCancel={() => { drag.current = null; onPreview(null); }}
    onKeyDown={event => {
      if (disabled) return;
      const target = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 1, End: count }[event.key];
      if (target === undefined) return;
      event.preventDefault();
      event.stopPropagation();
      if (place(target) !== index) onMove(place(target));
    }}>
    <span className="h-[3px] w-full rounded-full bg-info/70 group-hover:bg-info group-focus-visible:bg-info" />
  </div>;
}

/**
 * Edit mode's design tree, as SolidWorks' FeatureManager shows a part: its name at the top, its
 * Parameters (the named sizes, typed over to change), the Front, Top and Right planes and the
 * Origin, then its features in the order the script makes them, each solid's sketch under it and a
 * sketch nothing uses yet on a row of its own. An assembly lists its parts as components, each
 * opening to its own features. Selecting a feature draws its dimensions on the model and shows its
 * inputs under the tree; selecting a plane draws it; double-clicking a sketch edits it, and a
 * feature a command made reopens that command's panel (`edit.editFeature`). Suppress sets a feature
 * aside, greyed where it is (`edit.suppress`). Delete (the key, or the row's menu) takes the
 * selected feature out of the script (`edit.remove`). The rollback bar under a part's features
 * (`edit.rollTo`) shows the part as it was above one, those below it greyed; new features go there.
 *
 * @param {{ edit: ReturnType<typeof import("./useEditMode.js").useEditMode>,
 *   tree: ReturnType<typeof import("./editMode.js").featureTree>, onEditSketch?: (sketch: object) => void }} props
 */
export default function EditTree({ edit, tree, onEditSketch = () => {}, onOpenPart = null, backTo = null }) {
  const [open, setOpen] = useState(() => new Set(["parameters"]));
  // A selection inside a closed part, or a sketch under a closed feature, opens them to it.
  useEffect(() => {
    const selected = edit.selected || "";
    const featureId = selected.startsWith("sketch:") ? selected.slice("sketch:".length) : selected;
    const owners = [];
    for (const component of tree.components || []) {
      if (component.features.some(feature => feature.id === featureId)) owners.push(component.id);
    }
    if (selected.startsWith("sketch:")) owners.push(featureId);
    if (owners.length) setOpen(current => (owners.every(id => current.has(id)) ? current : new Set([...current, ...owners])));
  }, [edit.selected, tree]);
  const toggle = id => () => setOpen(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const treeRef = useRef(null);
  // Where the rollback bar is being dragged to, while it is.
  const [dragged, setDragged] = useState(null);
  const params = edit.state?.params || [];
  const disabled = edit.saving || edit.status !== "ready";
  const rowProps = { selected: edit.selected, onSelect: edit.select, onHover: edit.hover };
  const name = sizeName(edit.state?.name || "") || "Part";
  // A row's menu: Edit Feature on a feature a command made, Edit Sketch where it has a sketch to
  // edit, and Delete on a feature or a sketch of its own (a feature's sketch goes with its feature).
  const busy = disabled || Boolean(edit.sketch);
  const featureItem = feature => (feature.edit ? [{ id: "edit-feature", label: "Edit Feature", disabled: busy, onSelect: () => edit.editFeature(feature) }] : []);
  const suppressItem = (feature, separatorBefore) => ({ id: "suppress", label: feature.suppressed ? "Unsuppress" : "Suppress", disabled: busy,
    separatorBefore, onSelect: () => void edit.suppress(feature.id, tree, !feature.suppressed) });
  // A suppressed feature, and the sketch under it, greyed as SolidWorks greys them; so are the
  // features below the rollback bar.
  const greyed = icon => <span className="flex shrink-0 opacity-50">{icon}</span>;
  const rolled = rolledBack(tree, edit.bar);
  const partItems = tree.assembly ? [] : tree.features;
  const barAt = barIndex(tree, edit.bar);
  const rollItems = feature => {
    const index = partItems.findIndex(each => each.id === feature.id);
    if (index < 0) return [];
    return [
      { id: "rollback", label: "Rollback", disabled: busy || index === 0 || index === barAt, separatorBefore: true,
        onSelect: () => void edit.rollTo(feature.id) },
      ...(edit.bar ? [{ id: "roll-to-end", label: "Roll to End", disabled: busy, onSelect: () => void edit.rollTo(null) }] : []),
    ];
  };
  const editItem = sketch => (sketch?.constrained ? [{ id: "edit-sketch", label: "Edit Sketch", disabled, onSelect: () => onEditSketch(sketch) }] : []);
  const deleteItem = (id, separatorBefore) => ({ id: "delete", label: "Delete", destructive: true, disabled: disabled || Boolean(edit.sketch),
    separatorBefore, onSelect: () => void edit.remove(id, tree) });
  const sketchRow = (sketch, depth, own = null, muted = false) => {
    const edits = editItem(sketch);
    return <Row key={sketch.id} id={sketch.id} depth={depth} icon={muted ? greyed(<SketchIcon />) : <SketchIcon />} muted={muted}
      title={`${SKETCH_MARKS[sketch.status] || ""}${sketch.title}`} detail={sketch.plane && sketch.plane !== "Plane" ? `${sketch.plane} Plane` : ""}
      slot={own ? partItems.findIndex(each => each.id === own.id) : null}
      onActivate={() => onEditSketch(sketch)}
      menu={own ? [...edits, ...rollItems(own), deleteItem(sketch.id, true)] : edits} {...rowProps} />;
  };
  const featureRows = (feature, depth) => {
    const out = rolled.has(feature.id);
    if (feature.kind === "Sketch") return [sketchRow(feature.sketch, depth, feature, out)];
    const branch = Boolean(feature.sketch);
    const expanded = open.has(feature.id);
    const detail = feature.suppressed ? "Suppressed" : `${feature.name}${feature.count > 1 ? ` ×${feature.count}` : ""}`;
    const edits = [...featureItem(feature), ...editItem(feature.sketch)];
    const grey = feature.suppressed || out;
    const slot = partItems.findIndex(each => each.id === feature.id);
    return [
      <Row key={feature.id} id={feature.id} depth={depth} title={feature.title} detail={detail} muted={grey}
        icon={grey ? greyed(<FeatureIcon kind={feature.kind} />) : <FeatureIcon kind={feature.kind} />}
        expanded={branch ? expanded : null} onToggle={branch ? toggle(feature.id) : null} slot={slot < 0 ? null : slot}
        onActivate={feature.edit && !busy ? () => edit.editFeature(feature) : null}
        menu={[...edits, ...rollItems(feature), suppressItem(feature, true), deleteItem(feature.id, true)]} {...rowProps} />,
      branch && expanded ? sketchRow(feature.sketch, depth + 1, null, grey) : null,
    ];
  };
  const features = (list, depth) => list.flatMap(feature => featureRows(feature, depth));
  // The bar's place as the pointer drags it: above the first row whose middle is below the pointer.
  const slotAt = clientY => {
    const slots = [...(treeRef.current?.querySelectorAll("[data-cad-edit-bar-slot]") || [])];
    const below = slots.find(slot => clientY < slot.getBoundingClientRect().top + slot.getBoundingClientRect().height / 2);
    return below ? Number(below.getAttribute("data-cad-edit-bar-slot")) : partItems.length;
  };
  const bar = partItems.length > 1 && edit.status === "ready" ? <RollbackBar key="rollback-bar" index={barAt} count={partItems.length}
    label={barAt >= partItems.length ? "At the end" : `Above ${partItems[barAt].title}`} disabled={busy}
    slotAt={slotAt} onPreview={setDragged}
    onMove={index => void edit.rollTo(index >= partItems.length ? null : partItems[index].id)} /> : null;
  // Where a dragged bar would go, drawn faintly until it is let go; it takes no room, so the rows
  // under the pointer stay put.
  const preview = <div key="rollback-preview" aria-hidden="true" className="relative h-0 shrink-0">
    <span className="absolute inset-x-2 -top-px h-0.5 rounded-full bg-info/60" />
  </div>;
  // The part's features, the rollback bar among them where it is.
  const partRows = () => {
    const groups = partItems.map(feature => featureRows(feature, 1));
    const marks = [[barAt, bar], ...(dragged !== null && dragged !== barAt ? [[dragged, preview]] : [])];
    return groups.flatMap((group, index) => [...marks.filter(([at]) => at === index).map(([, mark]) => mark), ...group])
      .concat(marks.filter(([at]) => at >= groups.length).map(([, mark]) => mark));
  };
  // The Delete key on the selected feature, as SolidWorks takes it; in sketch mode the key is the
  // sketch's (its entities).
  const onKeyDown = event => {
    if ((event.key !== "Delete" && event.key !== "Backspace") || disabled || edit.sketch || !edit.selected) return;
    if (event.target instanceof Element && event.target.closest("input, textarea, [contenteditable]")) return;
    const id = edit.selected;
    if (!treeFeatures(tree).some(feature => feature.id === id || feature.sketch?.id === id)) return;
    event.preventDefault();
    void edit.remove(id, tree);
  };
  return <div ref={treeRef} role="tree" aria-label="Design tree" className="flex flex-col px-1 py-1" data-cad-edit-tree="" onKeyDown={onKeyDown}>
    {backTo ? <button type="button" className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1 text-left text-tiny text-muted-foreground hover:bg-accent/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/45"
      onClick={backTo.open} data-cad-edit-back="">
      <AssemblyIcon /><span className="truncate">{`Back to ${backTo.title}`}</span>
    </button> : null}
    <Row id="" depth={0} icon={tree.assembly ? <AssemblyIcon /> : <PartIcon />} title={name} {...rowProps} />
    <Row id="" depth={1} icon={<ParametersIcon />} title="Parameters" expanded={open.has("parameters")} onToggle={toggle("parameters")} {...rowProps} />
    {open.has("parameters") ? <div role="group" aria-label="Parameters" className="flex flex-col pb-1" style={{ paddingLeft: 4 + 2 * (TREE_INDENT_PX + 2) }}>
      {edit.status === "reading" ? <span className="py-1 text-tiny text-muted-foreground">Reading the part</span>
        : params.length === 0 ? <span className="py-1 text-tiny text-muted-foreground">No named sizes yet.</span>
          : params.map(param => <div key={param.id} className="flex min-h-7 items-center justify-between gap-2 pr-1">
            <span className="truncate text-tiny text-foreground/80">{sizeName(param.name)}</span>
            <span className="flex shrink-0 items-center gap-1">
              <FileSheetValueInput value={param.text} ariaLabel={`${sizeName(param.name)} value`} disabled={disabled}
                onValueCommit={draft => { const text = String(draft).trim(); if (text && text !== String(param.text)) edit.change({ literal: param.id, text }); }} />
              <span className="w-4 text-micro text-muted-foreground">{UNIT_MARKS[param.unit] || param.unit || ""}</span>
            </span>
          </div>)}
    </div> : null}
    {ORIGIN_PLANES.map(plane => <Row key={plane} id={`plane:${plane}`} depth={1} icon={<PlaneIcon />} title={`${plane} Plane`} {...rowProps} />)}
    <Row id="origin" depth={1} icon={<OriginIcon />} title="Origin" {...rowProps} />
    {tree.assembly && onOpenPart && tree.components.some(component => component.step)
      ? <p className="px-2 py-1 text-tiny leading-4 text-muted-foreground">Double-click a part to open it and model it.</p> : null}
    {tree.assembly
      ? tree.components.flatMap(component => [
        // A part of the assembly opens on its own to be modeled, as SolidWorks' Open Part opens it.
        <Row key={component.id} id={component.id} depth={1} icon={<PartIcon />} title={component.title}
          expanded={open.has(component.id)} onToggle={toggle(component.id)}
          onActivate={component.step && onOpenPart ? () => onOpenPart(component) : null}
          menu={component.step && onOpenPart ? [{ id: "open-part", label: "Open Part", onSelect: () => onOpenPart(component) }] : null}
          {...rowProps} />,
        ...(open.has(component.id) ? features(component.features, 2) : []),
      ])
      : partRows()}
  </div>;
}
