import { useEffect, useState } from "react";
import { TREE_INDENT_PX, TreeRowChevron, TreeRowSurface } from "@text-to-cad/ui/primitives/tree-row";
import { FileSheetValueInput } from "../../kit/inspector/FileSheet.js";
import { ORIGIN_PLANES, sizeName } from "./editMode.js";
import { AssemblyIcon, FeatureIcon, OriginIcon, ParametersIcon, PartIcon, PlaneIcon, SketchIcon } from "./featureIcons.jsx";

const UNIT_MARKS = Object.freeze({ mm: "mm", in: "in" });

/** One row of the tree: its place (depth), its disclosure when it has rows under it, its icon and name. */
function Row({ id, depth, icon, title, detail = "", expanded = null, onToggle = null, selected, onSelect, onHover, muted = false }) {
  const active = Boolean(id) && selected === id;
  return <TreeRowSurface as="div" dense active={active} role="treeitem" aria-selected={active}
    aria-expanded={expanded === null ? undefined : expanded} tabIndex={-1}
    className="cursor-default select-none" style={{ paddingLeft: 4 + depth * (TREE_INDENT_PX + 2) }}
    data-cad-edit-tree-row={id || title}
    onClick={() => { if (id) onSelect(id); else onToggle?.(); }}
    onDoubleClick={() => onToggle?.()}
    onPointerEnter={() => onHover(id || null)} onPointerLeave={() => onHover(null)}>
    <span className="flex w-3 shrink-0 justify-center" onClick={event => { if (onToggle) { event.stopPropagation(); onToggle(); } }}>
      <TreeRowChevron expanded={Boolean(expanded)} branch={expanded !== null} />
    </span>
    {icon}
    <span className={muted ? "truncate text-muted-foreground" : "truncate"}>{title}</span>
    {detail ? <span className="ml-auto truncate pl-2 text-muted-foreground">{detail}</span> : null}
  </TreeRowSurface>;
}

/**
 * Edit mode's design tree, as SolidWorks' FeatureManager shows a part: its name at the top, its
 * Parameters (the named sizes, typed over to change), the Front, Top and Right planes and the
 * Origin, then its features in the order the script makes them, each solid's sketch under it. An
 * assembly lists its parts as components, each opening to its own features. Selecting a feature
 * draws its dimensions on the model and shows its inputs under the tree; selecting a plane draws it.
 *
 * @param {{ edit: ReturnType<typeof import("./useEditMode.js").useEditMode>,
 *   tree: ReturnType<typeof import("./editMode.js").featureTree> }} props
 */
export default function EditTree({ edit, tree }) {
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
  const features = (list, depth) => list.flatMap(feature => {
    const branch = Boolean(feature.sketch);
    const expanded = open.has(feature.id);
    const detail = `${feature.name}${feature.count > 1 ? ` ×${feature.count}` : ""}`;
    return [
      <Row key={feature.id} id={feature.id} depth={depth} icon={<FeatureIcon kind={feature.kind} />} title={feature.title} detail={detail}
        expanded={branch ? expanded : null} onToggle={branch ? toggle(feature.id) : null} {...rowProps} />,
      branch && expanded ? <Row key={feature.sketch.id} id={feature.sketch.id} depth={depth + 1} icon={<SketchIcon />} title={feature.sketch.title}
        detail={feature.sketch.plane && feature.sketch.plane !== "Plane" ? `${feature.sketch.plane} Plane` : ""} {...rowProps} /> : null,
    ];
  });
  return <div role="tree" aria-label="Design tree" className="flex flex-col px-1 py-1" data-cad-edit-tree="">
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
