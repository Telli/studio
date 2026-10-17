import { useEffect, useState } from "react";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from "@text-to-cad/ui/primitives/context-menu";
import { TREE_INDENT_PX, TreeRowChevron, TreeRowSurface } from "@text-to-cad/ui/primitives/tree-row";
import { FileSheetValueInput } from "../../kit/inspector/FileSheet.js";
import { ORIGIN_PLANES, sizeName, treeFeatures } from "./editMode.js";
import { AssemblyIcon, FeatureIcon, OriginIcon, ParametersIcon, PartIcon, PlaneIcon, SketchIcon } from "./featureIcons.jsx";

const UNIT_MARKS = Object.freeze({ mm: "mm", in: "in" });
// How defined a sketch is, marked before its name as SolidWorks marks it: (-) under, (+) over.
const SKETCH_MARKS = Object.freeze({ "Under defined": "(-) ", "Over defined": "(+) " });

/** One row of the tree: its place (depth), its disclosure when it has rows under it, its icon and
 * name. A double-click opens it (`onActivate`: Edit Sketch on a sketch), else opens or closes it;
 * a right-click selects it and opens its menu (`menu`: Edit Sketch, Delete), as SolidWorks' does. */
function Row({ id, depth, icon, title, detail = "", expanded = null, onToggle = null, onActivate = null, selected, onSelect, onHover, muted = false, menu = null }) {
  const active = Boolean(id) && selected === id;
  const row = <TreeRowSurface as="div" dense active={active} role="treeitem" aria-selected={active}
    aria-expanded={expanded === null ? undefined : expanded} tabIndex={-1}
    className="cursor-default select-none" style={{ paddingLeft: 4 + depth * (TREE_INDENT_PX + 2) }}
    data-cad-edit-tree-row={id || title}
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
 * Edit mode's design tree, as SolidWorks' FeatureManager shows a part: its name at the top, its
 * Parameters (the named sizes, typed over to change), the Front, Top and Right planes and the
 * Origin, then its features in the order the script makes them, each solid's sketch under it and a
 * sketch nothing uses yet on a row of its own. An assembly lists its parts as components, each
 * opening to its own features. Selecting a feature draws its dimensions on the model and shows its
 * inputs under the tree; selecting a plane draws it; double-clicking a sketch edits it. Delete (the
 * key, or the row's menu) takes the selected feature out of the script (`edit.remove`).
 *
 * @param {{ edit: ReturnType<typeof import("./useEditMode.js").useEditMode>,
 *   tree: ReturnType<typeof import("./editMode.js").featureTree>, onEditSketch?: (sketch: object) => void }} props
 */
export default function EditTree({ edit, tree, onEditSketch = () => {} }) {
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
  const params = edit.state?.params || [];
  const disabled = edit.saving || edit.status !== "ready";
  const rowProps = { selected: edit.selected, onSelect: edit.select, onHover: edit.hover };
  const name = sizeName(edit.state?.name || "") || "Part";
  // A row's menu: Edit Sketch where it has a sketch to edit, and Delete on a feature or a sketch of
  // its own (a feature's sketch goes with its feature).
  const editItem = sketch => (sketch?.constrained ? [{ id: "edit-sketch", label: "Edit Sketch", disabled, onSelect: () => onEditSketch(sketch) }] : []);
  const deleteItem = (id, separatorBefore) => ({ id: "delete", label: "Delete", destructive: true, disabled: disabled || Boolean(edit.sketch),
    separatorBefore, onSelect: () => void edit.remove(id, tree) });
  const sketchRow = (sketch, depth, own = false) => {
    const edits = editItem(sketch);
    return <Row key={sketch.id} id={sketch.id} depth={depth} icon={<SketchIcon />}
      title={`${SKETCH_MARKS[sketch.status] || ""}${sketch.title}`} detail={sketch.plane && sketch.plane !== "Plane" ? `${sketch.plane} Plane` : ""}
      onActivate={() => onEditSketch(sketch)} menu={own ? [...edits, deleteItem(sketch.id, edits.length > 0)] : edits} {...rowProps} />;
  };
  const features = (list, depth) => list.flatMap(feature => {
    if (feature.kind === "Sketch") return [sketchRow(feature.sketch, depth, true)];
    const branch = Boolean(feature.sketch);
    const expanded = open.has(feature.id);
    const detail = `${feature.name}${feature.count > 1 ? ` ×${feature.count}` : ""}`;
    const edits = editItem(feature.sketch);
    return [
      <Row key={feature.id} id={feature.id} depth={depth} icon={<FeatureIcon kind={feature.kind} />} title={feature.title} detail={detail}
        expanded={branch ? expanded : null} onToggle={branch ? toggle(feature.id) : null}
        menu={[...edits, deleteItem(feature.id, edits.length > 0)]} {...rowProps} />,
      branch && expanded ? sketchRow(feature.sketch, depth + 1) : null,
    ];
  });
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
  return <div role="tree" aria-label="Design tree" className="flex flex-col px-1 py-1" data-cad-edit-tree="" onKeyDown={onKeyDown}>
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
    {tree.assembly
      ? tree.components.flatMap(component => [
        <Row key={component.id} id={component.id} depth={1} icon={<PartIcon />} title={component.title}
          expanded={open.has(component.id)} onToggle={toggle(component.id)} {...rowProps} />,
        ...(open.has(component.id) ? features(component.features, 2) : []),
      ])
      : features(tree.features, 1)}
  </div>;
}
