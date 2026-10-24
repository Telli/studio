import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@text-to-cad/ui/primitives/scroll-area";
import { TooltipHint } from "@text-to-cad/ui/primitives/tooltip";
import { cn } from "@text-to-cad/ui/utils";
import { WORKSPACE_SURFACE_CLASS } from "../../../lib/floatingSurface.js";
import { VIEWPORT_CUBE_BOTTOM } from "../../kit/shell/viewportLayout.js";
import { FeatureIcon } from "./featureIcons.jsx";
import { slotAtX, timelineItems } from "./timeline.js";

// The timeline's measures, in rem: a tile for each item, the gap between two (room for the marker, which
// stands in it) and the padding at the ends. The marker's place is arithmetic on them, so no layout is read to draw it.
const TILE = 1.75, GAP = 0.5, PAD = 0.5;
const MEASURES = Object.freeze({ "--tl-tile": `${TILE}rem`, "--tl-gap": `${GAP}rem`, "--tl-pad": `${PAD}rem` });
// Who made an item, as its dot says and its tooltip words it: the agent's in purple, yours in grey. An item
// nobody is known to have made has neither.
const AUTHOR_WORDS = Object.freeze({ agent: "Made by the agent", you: "Made by you" });
const AUTHOR_DOT_CLASS = Object.freeze({ agent: "bg-cad-agent", you: "bg-muted-foreground" });

/** What an item's tooltip adds under its title: that it is set aside, and who made it. */
const notesOf = item => [item.feature.suppressed ? "Suppressed" : "", AUTHOR_WORDS[item.author] || ""].filter(Boolean);

/**
 * The rollback marker, as the Part Navigator's bar is, laid along the timeline: dragged back to a gap
 * between items (or moved an item at a time with the arrow keys) to show the part as it was there.
 * `index` is the item it stands before (`count`: past the last). While dragged it follows the pointer
 * from gap to gap and `onPreview` says which gap it is in (null: the one it began in), which draws the
 * timeline again and never the model; the part is rolled back when it is let go (`onMove`). `slot` is
 * the gap it is drawn in, `centersOf` the items' centres in the pointer's own coordinates, measured as
 * the press lands.
 */
function RollbackMarker({ index, slot, count, label, disabled, centersOf, onPreview, onMove }) {
  const drag = useRef(null);
  // Taken away mid-drag (the part is being read again), it leaves no gap to draw it in.
  useEffect(() => () => onPreview(null), [onPreview]);
  // Never above the first item: that would leave no part.
  const place = target => Math.max(1, Math.min(count, target));
  return <TooltipHint content="Rollback marker: drag it back to see the part as it was there" side="top" disabled={disabled}>
    <div role="slider" aria-label="Rollback marker" aria-orientation="horizontal" aria-valuemin={1} aria-valuemax={count}
      aria-valuenow={index} aria-valuetext={label} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : 0}
      data-cad-edit-rollback-marker=""
      className={cn("group/marker absolute bottom-2 left-0 top-1.5 z-10 flex touch-none justify-center focus-visible:outline-none",
        disabled ? "cursor-default opacity-50" : "cursor-grab active:cursor-grabbing")}
      style={{ width: `${GAP}rem`, transform: `translateX(${PAD + slot * (TILE + GAP) - GAP}rem)` }}
      onPointerDown={event => {
        if (disabled || event.button !== 0) return;
        // No text selection while dragging; focus taken by hand, so the arrow keys move it after a click.
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { centers: centersOf(), at: index };
      }}
      onPointerMove={event => {
        if (!drag.current) return;
        const at = place(slotAtX(event.clientX, drag.current.centers));
        if (at !== drag.current.at) { drag.current.at = at; onPreview(at === index ? null : at); }
      }}
      onPointerUp={event => {
        if (!drag.current) return;
        const { at } = drag.current;
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        onPreview(null);
        if (at !== index) onMove(at);
      }}
      onPointerCancel={() => { drag.current = null; onPreview(null); }}
      onKeyDown={event => {
        if (disabled) return;
        const target = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 1, End: count }[event.key];
        if (target === undefined) return;
        event.preventDefault();
        event.stopPropagation();
        if (place(target) !== index) onMove(place(target));
      }}>
      <span className="h-full w-[3px] rounded-full bg-info/70 group-hover/marker:bg-info group-focus-visible/marker:bg-info" />
    </div>
  </TooltipHint>;
}

/**
 * Edit mode's timeline, as Fusion lays one along the bottom of its window: every feature of the part as
 * its icon, in the order the Part Navigator lists them (`timeline.js`; sketches of their own among them),
 * named by its title on hover, with a dot under it for who made it (the agent's purple, yours grey, none
 * where it is not known: `edit.state.authors`). A click selects an item, as the Part Navigator's row does,
 * and a double-click edits it: Edit Parameters on a feature a command made (`edit.editFeature`), Edit
 * Sketch on a sketch (`onEditSketch`). The rollback marker stands after the last item the part still has,
 * and is dragged back to roll the part back to there, the same rollback as the Part Navigator's bar and
 * its Make Current Feature (`edit.rollTo`). What the marker leaves out, and what is suppressed, is greyed.
 * It floats over the canvas on the workspace's white card, an inset in from the frame's `bottomDock`
 * (a dock with no height of its own, kept clear of the cube), on the cube's line, and draws nothing for a
 * part with no features or for an assembly.
 *
 * @param {{ edit: ReturnType<typeof import("./useEditMode.js").useEditMode>,
 *   tree: ReturnType<typeof import("./editMode.js").featureTree>, onEditSketch?: (sketch: object) => void }} props
 */
export default function EditTimeline({ edit, tree, onEditSketch = () => {} }) {
  const authors = edit.state?.authors;
  const { items, marker } = useMemo(() => timelineItems(tree, edit.bar, authors), [tree, edit.bar, authors]);
  // The gap the marker is dragged to, while it is: the items past it are drawn as the part will have them.
  const [dragged, setDragged] = useState(null);
  const listRef = useRef(null);
  if (!items.length) return null;
  const disabled = edit.saving || edit.status !== "ready";
  // As in the Part Navigator, nothing is edited or rolled back while a sketch is open or a change is on its way.
  const busy = disabled || Boolean(edit.sketch);
  const slot = dragged ?? marker;
  const centersOf = () => [...(listRef.current?.querySelectorAll("[data-cad-timeline-item]") || [])].map(cell => {
    const box = cell.getBoundingClientRect();
    return box.left + box.width / 2;
  });
  // A double-click edits: the command that made a feature, or a sketch where it is its own.
  const open = item => {
    if (item.kind === "Sketch") { if (!disabled) onEditSketch(item.feature.sketch); return; }
    if (item.feature.edit && !busy) edit.editFeature(item.feature);
  };
  // The card is a box of its own around the ScrollArea: the ScrollArea's root sets its position inline, so it
  // cannot be placed by a class.
  return <div role="group" aria-label="Timeline" data-cad-edit-timeline=""
    className={cn(WORKSPACE_SURFACE_CLASS, "pointer-events-auto absolute inset-x-2 flex select-none overflow-hidden")} style={{ bottom: VIEWPORT_CUBE_BOTTOM }}>
    <ScrollArea orientation="horizontal" className="min-w-0 flex-1">
      <div ref={listRef} className="relative flex items-start gap-(--tl-gap) px-(--tl-pad) pb-2 pt-1.5" style={MEASURES}>
        {items.map((item, index) => {
          const selected = edit.selected === item.id;
          const out = dragged === null ? item.rolledBack : index >= dragged;
          const notes = notesOf(item);
          return <TooltipHint key={item.id} side="top" content={<>
            {item.title}{notes.map(note => <span key={note} className="block text-muted-foreground">{note}</span>)}
          </>}>
            <button type="button" aria-label={item.title} aria-description={notes.join(". ") || undefined} aria-pressed={selected}
              data-cad-timeline-item={item.id} data-rolled-back={out ? "" : undefined} data-suppressed={item.feature.suppressed ? "" : undefined}
              className="group/item flex shrink-0 flex-col items-center gap-0.5 focus-visible:outline-none"
              onClick={() => edit.select(item.id)} onDoubleClick={() => open(item)}>
              {/* Under the pointer the workspace's pale blue, selected its deeper one; nothing else changes. */}
              <span className={cn("flex size-(--tl-tile) items-center justify-center rounded-sm border border-border [&_svg]:m-0 [&_svg]:size-5 group-focus-visible/item:ring-2 group-focus-visible/item:ring-ring/45",
                selected ? "bg-cad-ws-selected" : "bg-background group-hover/item:bg-cad-ws-hover")}>
                <span className="flex group-data-[rolled-back]/item:opacity-50 group-data-[suppressed]/item:opacity-50"><FeatureIcon kind={item.kind} /></span>
              </span>
              <span data-cad-timeline-author={item.author ?? undefined} className={cn("size-1.5 rounded-full", item.author && AUTHOR_DOT_CLASS[item.author])} />
            </button>
          </TooltipHint>;
        })}
        {items.length > 1 && edit.status === "ready" ? <RollbackMarker index={marker} slot={slot} count={items.length}
          label={marker >= items.length ? "At the end" : `Above ${items[marker].title}`} disabled={busy}
          centersOf={centersOf} onPreview={setDragged}
          onMove={index => void edit.rollTo(index >= items.length ? null : items[index].id)} /> : null}
      </div>
    </ScrollArea>
  </div>;
}
