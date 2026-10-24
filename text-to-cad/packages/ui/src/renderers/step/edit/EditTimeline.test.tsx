import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EditTimeline from '../../../../dist/renderers/step/edit/EditTimeline.js';
import { featureTree } from '../../../../dist/renderers/step/edit/editMode.js';
import { WORKSPACE_SURFACE_CLASS } from '../../../../dist/lib/floatingSurface.js';

const outline = (name: string, line: number) => ({ name, plane: 'Top', file: 'bracket.py', line, status: 'Fully defined' });
const command = { command: 'extrude', values: {}, keeps: '' };

// A part as the engine reads it: two sketches of their own, the extrudes a command made from them, and
// an Edge Blend written by hand. The Part Navigator numbers them Sketch (1), Extrude (2), Sketch (3),
// Extrude (4), Edge Blend (5).
const STATE = {
  units: 'mm', name: 'bracket', params: [], rows: [],
  features: [
    { key: 's1', kind: 'Sketch', file: 'bracket.py', line: 5, sketch: outline('Outline', 5) },
    { key: 'e1', kind: 'Boss-Extrude', name: 'plate', file: 'bracket.py', line: 8, edit: command },
    { key: 's2', kind: 'Sketch', file: 'bracket.py', line: 10, sketch: outline('Rim', 10) },
    { key: 'e2', kind: 'Boss-Extrude', name: 'plate', file: 'bracket.py', line: 13, edit: command },
    { key: 'b1', kind: 'Fillet', name: 'plate', file: 'bracket.py', line: 15 },
  ],
};
const TREE = featureTree(STATE);
const IDS = ['s1', 'e1', 's2', 'e2', 'b1'];

function edit(patch: Record<string, unknown> = {}) {
  return { status: 'ready', saving: false, state: STATE, selected: null, bar: null, sketch: null,
    select: vi.fn(), rollTo: vi.fn(), editFeature: vi.fn(), ...patch };
}
const timeline = (patch: Record<string, unknown> = {}, onEditSketch = vi.fn()) => {
  const own = edit(patch);
  const view = render(<EditTimeline edit={own as never} tree={featureTree(own.state as never)} onEditSketch={onEditSketch} />);
  return { ...view, own, onEditSketch };
};
const items = () => within(screen.getByRole('group', { name: 'Timeline' })).getAllByRole('button');
const item = (name: string) => screen.getByRole('button', { name });
const marker = () => screen.getByRole('slider', { name: 'Rollback marker' });

// jsdom lays nothing out: the items stand 36px apart from the left edge, 28px wide, so their centres
// are 14, 50, 86, 122 and 158 (the pointer positions below are read against them). Capturing a pointer
// is the browser's own, so it is stubbed.
const boxOf = Element.prototype.getBoundingClientRect;
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const id = this.getAttribute('data-cad-timeline-item');
    return id ? DOMRect.fromRect({ x: IDS.indexOf(id) * 36, y: 0, width: 28, height: 36 }) : boxOf.call(this);
  };
  for (const name of ['setPointerCapture', 'releasePointerCapture']) Object.defineProperty(Element.prototype, name, { configurable: true, value() {} });
  Object.defineProperty(Element.prototype, 'hasPointerCapture', { configurable: true, value: () => true });
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); Element.prototype.getBoundingClientRect = boxOf;
  for (const name of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) delete (Element.prototype as any)[name];
});

/** The marker pressed, dragged through `xs` and let go at the last. */
function drag(xs: number[], { release = true } = {}) {
  fireEvent.pointerDown(marker(), { button: 0, pointerId: 1, clientX: 200 });
  for (const clientX of xs) fireEvent.pointerMove(marker(), { pointerId: 1, clientX });
  if (release) fireEvent.pointerUp(marker(), { pointerId: 1, clientX: xs.at(-1) });
}

it("shows every item as its icon, in the Part Navigator's order, named by its title", () => {
  timeline();
  expect(items().map(button => button.getAttribute('aria-label'))).toEqual(['Sketch (1) "Outline"', 'Extrude (2)', 'Sketch (3) "Rim"', 'Extrude (4)', 'Edge Blend (5)']);
  expect(items().map(button => button.querySelector('use')?.getAttribute('href'))).toEqual(['#nx-sketch', '#nx-extrude', '#nx-sketch', '#nx-extrude', '#nx-blend']);
  expect(items().map(button => button.getAttribute('data-cad-timeline-item'))).toEqual(IDS);
});

it("selects on a click and edits on a double-click: Edit Parameters on a feature, Edit Sketch on a sketch", () => {
  const { own, onEditSketch } = timeline();
  fireEvent.click(item('Extrude (4)'));
  expect(own.select).toHaveBeenLastCalledWith('e2');
  fireEvent.doubleClick(item('Extrude (4)'));
  expect(own.editFeature).toHaveBeenCalledTimes(1);
  expect(own.editFeature).toHaveBeenLastCalledWith(TREE.features[3]);
  expect(onEditSketch).not.toHaveBeenCalled();
  fireEvent.doubleClick(item('Sketch (3) "Rim"'));
  expect(onEditSketch).toHaveBeenCalledTimes(1);
  expect(onEditSketch).toHaveBeenLastCalledWith(TREE.features[2].sketch);
  expect(own.editFeature).toHaveBeenCalledTimes(1);
  // A feature no command made has no Edit Parameters: a double-click does nothing, as in the Part Navigator.
  fireEvent.doubleClick(item('Edge Blend (5)'));
  expect([own.editFeature, onEditSketch].map(each => each.mock.calls.length)).toEqual([1, 1]);
});

it("marks the selected item", () => {
  timeline({ selected: 'e1' });
  expect(items().map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false', 'false']);
});

it("is the workspace's white card, and lights an item in its pale blue under the pointer and its deeper blue selected", () => {
  timeline({ selected: 'e1' });
  // Opaque, a hairline and 6px corners, blurring nothing of the live canvas under it.
  const card = screen.getByRole('group', { name: 'Timeline' });
  expect(card.className.split(/\s+/)).toEqual(expect.arrayContaining(WORKSPACE_SURFACE_CLASS.split(' ')));
  expect(card.className).not.toMatch(/\bbackdrop-|bg-background\//);
  // Jsdom has no pointer to rest on an item: the colours are the workspace's tokens, which are all it takes.
  const tile = (name: string) => item(name).firstElementChild!.className;
  expect(tile('Extrude (2)')).toMatch(/\bbg-cad-ws-selected\b/);
  expect(tile('Extrude (4)')).toMatch(/group-hover\/item:bg-cad-ws-hover/);
});

it("edits nothing while the part is busy, as the Part Navigator's rows do not", () => {
  const { own, onEditSketch } = timeline({ saving: true });
  fireEvent.doubleClick(item('Extrude (2)'));
  fireEvent.doubleClick(item('Sketch (1) "Outline"'));
  expect([own.editFeature, onEditSketch].map(each => each.mock.calls.length)).toEqual([0, 0]);
  fireEvent.click(item('Extrude (2)'));
  expect(own.select).toHaveBeenCalledWith('e1');
  cleanup();
  // A sketch open takes Edit Parameters away, not the way into another sketch.
  const sketching = timeline({ sketch: { file: 'bracket.py', line: 5 } });
  fireEvent.doubleClick(item('Extrude (2)'));
  expect(sketching.own.editFeature).not.toHaveBeenCalled();
  fireEvent.doubleClick(item('Sketch (3) "Rim"'));
  expect(sketching.onEditSketch).toHaveBeenCalledTimes(1);
});

it("stands the marker after the last item the part has, and greys what the rollback bar leaves out", () => {
  timeline();
  expect([marker().getAttribute('aria-valuenow'), marker().getAttribute('aria-valuetext')]).toEqual(['5', 'At the end']);
  expect(items().some(button => button.hasAttribute('data-rolled-back'))).toBe(false);
  cleanup();
  timeline({ bar: { item: 'e2' } });
  expect([marker().getAttribute('aria-valuenow'), marker().getAttribute('aria-valuetext')]).toEqual(['3', 'Above Extrude (4)']);
  expect(items().map(button => button.hasAttribute('data-rolled-back'))).toEqual([false, false, false, true, true]);
});

it("greys a suppressed item where it stands, rolled back or not", () => {
  const aside = { ...STATE, features: STATE.features.map(feature => (feature.key === 'e1' ? { ...feature, suppressed: true } : feature)) };
  timeline({ state: aside });
  expect(items().map(button => button.hasAttribute('data-suppressed'))).toEqual([false, true, false, false, false]);
  expect(items().some(button => button.hasAttribute('data-rolled-back'))).toBe(false);
});

it("marks who made an item with a dot, and an item nobody is known to have made with none", () => {
  timeline({ state: { ...STATE, authors: { s1: 'you', e2: 'agent', b1: 'someone else' } } });
  const dots = items().map(button => button.querySelector('[data-cad-timeline-author]')?.getAttribute('data-cad-timeline-author') ?? null);
  expect(dots).toEqual(['you', null, null, 'agent', null]);
  cleanup();
  // A part from before Studio kept track has neither.
  timeline();
  expect(document.querySelectorAll('[data-cad-timeline-author]').length).toBe(0);
});

it("says on hover what an item is, who made it and whether it is set aside", () => {
  vi.useFakeTimers();
  const aside = { ...STATE, authors: { e2: 'agent', s1: 'you' },
    features: STATE.features.map(feature => (feature.key === 'e1' ? { ...feature, suppressed: true } : feature)) };
  timeline({ state: aside });
  const hover = (node: Element) => { fireEvent.pointerMove(node, { pointerType: 'mouse' }); act(() => { vi.advanceTimersByTime(450); }); };
  hover(item('Extrude (4)'));
  expect(screen.getByRole('tooltip').textContent).toBe('Extrude (4)Made by the agent');
  fireEvent.pointerLeave(item('Extrude (4)'));
  hover(item('Sketch (1) "Outline"'));
  expect(screen.getByRole('tooltip').textContent).toBe('Sketch (1) "Outline"Made by you');
  fireEvent.pointerLeave(item('Sketch (1) "Outline"'));
  hover(item('Extrude (2)'));
  expect(screen.getByRole('tooltip').textContent).toBe('Extrude (2)Suppressed');
  fireEvent.pointerLeave(item('Extrude (2)'));
  // Nothing more to say of an item from before Studio kept track.
  hover(item('Edge Blend (5)'));
  expect(screen.getByRole('tooltip').textContent).toBe('Edge Blend (5)');
});

it("moves the marker under the pointer, and rolls the part back only when it is let go", () => {
  const { own } = timeline();
  drag([180, 100], { release: false });
  // The marker stands between the third and fourth items and what is past it is greyed, but the part has not moved.
  expect(items().map(button => button.hasAttribute('data-rolled-back'))).toEqual([false, false, false, true, true]);
  expect(own.rollTo).not.toHaveBeenCalled();
  fireEvent.pointerUp(marker(), { pointerId: 1, clientX: 100 });
  expect(own.rollTo).toHaveBeenCalledTimes(1);
  expect(own.rollTo).toHaveBeenCalledWith('e2');
  // The bar is the part's to move: until it does, the timeline shows where it is.
  expect(items().some(button => button.hasAttribute('data-rolled-back'))).toBe(false);
});

it("rolls to the end when the marker is let go past the last item, as Make Current Feature on the last feature does", () => {
  const { own } = timeline({ bar: { item: 'e2' } });
  drag([150, 400]);
  expect(own.rollTo).toHaveBeenCalledTimes(1);
  expect(own.rollTo).toHaveBeenCalledWith(null);
});

it("never rolls back past the first item, nor does anything for a marker let go where it was", () => {
  const { own } = timeline();
  drag([100, -50]);
  expect(own.rollTo).toHaveBeenLastCalledWith('e1');
  own.rollTo.mockClear();
  // Out and back to the slot it began at, or never out of it.
  drag([100, 190]);
  drag([180]);
  expect(own.rollTo).not.toHaveBeenCalled();
});

it("puts the marker back where it was when the drag is cancelled", () => {
  const { own } = timeline();
  drag([30], { release: false });
  expect(items().map(button => button.hasAttribute('data-rolled-back'))).toEqual([false, true, true, true, true]);
  fireEvent.pointerCancel(marker(), { pointerId: 1 });
  expect(items().some(button => button.hasAttribute('data-rolled-back'))).toBe(false);
  expect(own.rollTo).not.toHaveBeenCalled();
});

it("lets go of a drag when the marker is taken away in the middle of it", () => {
  const own = edit();
  const tree = featureTree(STATE);
  const { rerender } = render(<EditTimeline edit={own as never} tree={tree} />);
  drag([30], { release: false });
  expect(items().map(button => button.hasAttribute('data-rolled-back'))).toEqual([false, true, true, true, true]);
  // The part is read again: no marker, then the part is back and the marker is where the part has it.
  rerender(<EditTimeline edit={{ ...own, status: 'reading' } as never} tree={tree} />);
  rerender(<EditTimeline edit={own as never} tree={tree} />);
  expect(items().some(button => button.hasAttribute('data-rolled-back'))).toBe(false);
  expect(marker().getAttribute('aria-valuenow')).toBe('5');
  expect(own.rollTo).not.toHaveBeenCalled();
});

it("moves the marker an item at a time with the arrow keys", () => {
  const { own } = timeline({ bar: { item: 'e2' } });
  const key = (name: string) => fireEvent.keyDown(marker(), { key: name });
  // Above the fourth: back one is above the third, on one is above the fifth.
  key('ArrowLeft');
  expect(own.rollTo).toHaveBeenLastCalledWith('s2');
  key('ArrowRight');
  expect(own.rollTo).toHaveBeenLastCalledWith('b1');
  key('Home');
  expect(own.rollTo).toHaveBeenLastCalledWith('e1');
  key('End');
  expect(own.rollTo).toHaveBeenLastCalledWith(null);
  expect(own.rollTo).toHaveBeenCalledTimes(4);
  cleanup();
  // At the end it can only go back.
  const whole = timeline();
  fireEvent.keyDown(marker(), { key: 'ArrowRight' });
  fireEvent.keyDown(marker(), { key: 'End' });
  expect(whole.own.rollTo).not.toHaveBeenCalled();
  fireEvent.keyDown(marker(), { key: 'ArrowLeft' });
  expect(whole.own.rollTo).toHaveBeenCalledWith('b1');
});

it("keeps the marker still while the part is busy", () => {
  const { own } = timeline({ saving: true });
  expect(marker().getAttribute('aria-disabled')).toBe('true');
  drag([60]);
  fireEvent.keyDown(marker(), { key: 'ArrowLeft' });
  expect(own.rollTo).not.toHaveBeenCalled();
  cleanup();
  const sketching = timeline({ sketch: { file: 'bracket.py', line: 5 } });
  drag([60]);
  expect(sketching.own.rollTo).not.toHaveBeenCalled();
});

it("has no marker where there is nothing to roll back to, and no timeline where there is nothing", () => {
  const one = { ...STATE, features: STATE.features.slice(0, 1) };
  timeline({ state: one });
  expect(items().length).toBe(1);
  expect(screen.queryByRole('slider')).toBeNull();
  cleanup();
  // Not until the part is read.
  timeline({ status: 'reading' });
  expect(screen.queryByRole('slider')).toBeNull();
  cleanup();
  const empty = timeline({ state: { ...STATE, features: [] } });
  expect(empty.container.firstChild).toBeNull();
  cleanup();
  // An assembly's Part Navigator has no bar, and its parts are opened to be modeled.
  const assembly = { ...STATE, features: undefined, components: [{ file: 'tray.py', name: 'tray', features: STATE.features }] };
  expect(timeline({ state: assembly }).container.firstChild).toBeNull();
});
