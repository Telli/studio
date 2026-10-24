import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EditRibbon from '../../../../dist/renderers/step/edit/EditRibbon.js';

beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// The viewer's tools as the strip hands them to the ribbon, under the strip's names.
const tool = (id: string, label: string) => ({ id, label, icon: <svg />, active: false, disabled: false, onSelect: vi.fn() });
const PART_TOOLS = [tool('references', 'Select'), tool('measure', 'Measure'), tool('clip', 'Clip'), tool('pencil', 'Pencil'), tool('shapes', 'Shapes')];
const ASSEMBLY_TOOLS = [...PART_TOOLS, tool('exploded', 'Explode')];
const SKETCH = { name: 'Sketch1', state: { curves: [], status: 'Fully defined' } };

function edit(patch: Record<string, unknown> = {}) {
  return {
    status: 'ready', saving: false, rolling: false, error: '', state: { units: 'mm', components: [], drawing: null },
    command: null, inspecting: null, picking: false, sketch: null, sheetView: null, canUndo: true, canRedo: true,
    undo: vi.fn(), redo: vi.fn(), open: vi.fn(), close: vi.fn(), inspect: vi.fn(), stopInspecting: vi.fn(),
    startPicking: vi.fn(), stopPicking: vi.fn(), exitSketch: vi.fn(), lookNormalTo: vi.fn(), drawing: vi.fn(), openSheet: vi.fn(), closeSheet: vi.fn(),
    sketchTool: null, sketchSelection: [], construction: false, setSketchTool: vi.fn(), setConstruction: vi.fn(), selectInSketch: vi.fn(), sketchOp: vi.fn(),
    ...patch,
  };
}

const tabNames = () => screen.getAllByRole('tab').map(tab => tab.textContent);
const frontTab = () => screen.getAllByRole('tab').find(tab => tab.getAttribute('aria-selected') === 'true')?.textContent;
// A group's title is also its menu; what else is in it are its commands.
const menuButton = (group: HTMLElement) => within(group).getAllByRole('button').find(button => button.getAttribute('aria-haspopup') === 'menu')!;
const commandButtons = (group: HTMLElement) => within(group).queryAllByRole('button').filter(button => button.getAttribute('aria-haspopup') !== 'menu');
const group = (title: string) => screen.getByRole('group', { name: title });
const commandsIn = (title: string) => commandButtons(group(title)).map(button => button.getAttribute('aria-label'));
const command = (title: string, name: string) => commandButtons(group(title)).find(button => button.getAttribute('aria-label') === name)!;
// Every group of the tab in front with the commands it shows as buttons.
const layout = () => Object.fromEntries(screen.getAllByRole('group')
  .map(each => [each.getAttribute('aria-label'), commandButtons(each).map(button => button.getAttribute('aria-label'))]));

it("opens a group's command from its menu", async () => {
  const user = userEvent.setup();
  const onCommand = vi.fn();
  render(<EditRibbon tools={PART_TOOLS} edit={edit() as never} onCommand={onCommand} />);
  // Four of Create's nine commands show as buttons; the group's title is its menu, with all of them.
  expect(commandsIn('Create')).toEqual(['Sketch', 'Extrude', 'Revolve', 'Sweep along Guide']);
  await user.click(menuButton(group('Create')));
  const menu = screen.getByRole('menu');
  expect(within(menu).getAllByRole('menuitemcheckbox').map(item => item.textContent)).toEqual(['Sketch', 'Extrude', 'Revolve',
    'Sweep along Guide', 'Through Curves', 'Rib', 'Hole', 'Pattern Feature', 'Mirror Feature']);
  await user.click(within(menu).getByText('Through Curves'));
  expect(onCommand).toHaveBeenCalledWith('loft');
  expect(screen.queryByRole('menu')).toBeNull();
});

it("leaves out a group with nothing behind it", async () => {
  const user = userEvent.setup();
  const onAsk = vi.fn();
  const { rerender } = render(<EditRibbon tools={PART_TOOLS} edit={edit() as never} />);
  expect(screen.queryByRole('group', { name: 'Ask the agent' })).toBeNull();
  expect(Object.keys(layout())).toEqual(['Create', 'Modify', 'Construct', 'Inspect', 'Select']);
  // With Ask to wire, the group is there with Ask alone: Add to context and Annotate wait for what they need.
  rerender(<EditRibbon tools={PART_TOOLS} edit={edit() as never} onAsk={onAsk} />);
  expect(Object.keys(layout()).at(-1)).toBe('Ask the agent');
  expect(commandsIn('Ask the agent')).toEqual(['Ask']);
  await user.click(command('Ask the agent', 'Ask'));
  expect(onAsk).toHaveBeenCalledTimes(1);
  rerender(<EditRibbon tools={PART_TOOLS} edit={edit() as never} onAsk={onAsk} onAddContext={vi.fn()} />);
  expect(commandsIn('Ask the agent')).toEqual(['Ask', 'Add to context']);
  // The viewer's pencil is not in the toolbar until Annotate is.
  expect(screen.queryByRole('button', { name: 'Pencil' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Annotate' })).toBeNull();
});

it("heads the toolbar with Solid, Sketch and Inspect, Assemble only for an assembly, and Drafting where a part has its sheet", () => {
  const { rerender } = render(<EditRibbon tools={PART_TOOLS} edit={edit() as never} />);
  expect(tabNames()).toEqual(['Solid', 'Sketch', 'Inspect', 'Drafting']);
  expect(frontTab()).toBe('Solid');
  // An assembly places its parts, so its sheet is not offered; its Assemble tab is.
  rerender(<EditRibbon tools={ASSEMBLY_TOOLS} edit={edit({ state: { units: 'mm', components: [{ id: 'base' }], drawing: null } }) as never} />);
  expect(tabNames()).toEqual(['Solid', 'Sketch', 'Inspect', 'Assemble']);
});

it("groups the Solid tab's commands as the design does, each under NX's name", () => {
  render(<EditRibbon tools={PART_TOOLS} edit={edit() as never} />);
  expect(layout()).toEqual({
    Create: ['Sketch', 'Extrude', 'Revolve', 'Sweep along Guide'],
    Modify: ['Edge Blend', 'Chamfer', 'Shell'],
    Construct: ['Datum Plane'],
    Inspect: ['Measure', 'Edit Section'],
    Select: ['Select'],
  });
});

it("gives every command of the old Analysis, View and Assemblies tabs a group", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<EditRibbon tools={PART_TOOLS} edit={edit() as never} onNormalTo={vi.fn()} />);
  await user.click(screen.getByRole('tab', { name: 'Inspect' }));
  expect(layout()).toEqual({
    Measure: ['Measure', 'Measure Bodies'],
    Analyze: ['Draft Analysis', 'Simple Interference', 'Compare'],
    Section: ['Edit Section'],
    Display: ['Orient View', 'Edit Object Display'],
    Expressions: ['Expressions'],
  });
  // An assembly has no body of its own to analyze or color.
  rerender(<EditRibbon tools={ASSEMBLY_TOOLS} edit={edit({ state: { units: 'mm', components: [{ id: 'base' }], drawing: null } }) as never} onNormalTo={vi.fn()} />);
  expect(layout()).toEqual({
    Measure: ['Measure', 'Measure Bodies'],
    Analyze: ['Simple Interference'],
    Section: ['Edit Section'],
    Display: ['Orient View'],
    Expressions: ['Expressions'],
  });
  await user.click(screen.getByRole('tab', { name: 'Assemble' }));
  expect(layout()).toEqual({ Constraints: ['Assembly Constraints'], 'Exploded Views': ['Exploded Views'] });
});

it("keeps the drawing's commands in Drafting", async () => {
  const user = userEvent.setup();
  const { rerender } = render(<EditRibbon tools={PART_TOOLS} edit={edit() as never} />);
  await user.click(screen.getByRole('tab', { name: 'Drafting' }));
  expect(layout()).toEqual({ Sheet: ['New Sheet'] });
  rerender(<EditRibbon tools={PART_TOOLS} edit={edit({ state: { units: 'mm', components: [], drawing: { sheets: 1 } } }) as never} />);
  expect(layout()).toEqual({ Sheet: ['Drawing', 'Edit Sheet'] });
});

it("opens Expressions in the place the other Inspect panels open, and puts it away again", async () => {
  const user = userEvent.setup();
  const hand = edit();
  const { rerender } = render(<EditRibbon tools={PART_TOOLS} edit={hand as never} />);
  await user.click(screen.getByRole('tab', { name: 'Inspect' }));
  await user.click(command('Expressions', 'Expressions'));
  expect(hand.inspect).toHaveBeenCalledWith('expressions');
  const open = edit({ inspecting: 'expressions' });
  rerender(<EditRibbon tools={PART_TOOLS} edit={open as never} />);
  expect(command('Expressions', 'Expressions').getAttribute('aria-pressed')).toBe('true');
  await user.click(command('Expressions', 'Expressions'));
  expect(open.stopInspecting).toHaveBeenCalled();
});

it("holds Undo and Redo at the tab row's left, and the build status and units at its right", async () => {
  const user = userEvent.setup();
  const hand = edit({ canRedo: false });
  render(<EditRibbon tools={PART_TOOLS} edit={hand as never} />);
  const row = screen.getByRole('tablist').parentElement!;
  const undo = within(row).getByRole('button', { name: 'Undo' });
  const redo = within(row).getByRole('button', { name: 'Redo' }) as HTMLButtonElement;
  const tabs = within(row).getAllByRole('tab');
  const after = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
  expect(after(undo, redo) && after(redo, tabs[0])).toBe(true);
  expect(after(tabs.at(-1)!, within(row).getByText('Saved')) && after(within(row).getByText('Saved'), within(row).getByText('Millimeters'))).toBe(true);
  // They are no group of the toolbar: Undo and Redo are small icons beside the tabs.
  expect(screen.queryByRole('group', { name: 'Edit' })).toBeNull();
  expect(redo.disabled).toBe(true);
  await user.click(undo);
  expect(hand.undo).toHaveBeenCalledTimes(1);
});

it("holds the Sketch command alone in the Sketch tab while no sketch is open", async () => {
  const user = userEvent.setup();
  const onSketch = vi.fn();
  const { rerender } = render(<EditRibbon tools={PART_TOOLS} edit={edit() as never} onSketch={onSketch} />);
  await user.click(screen.getByRole('tab', { name: 'Sketch' }));
  expect(layout()).toEqual({ 'Direct Sketch': ['Sketch'] });
  await user.click(command('Direct Sketch', 'Sketch'));
  expect(onSketch).toHaveBeenCalledTimes(1);
  // Edit Sketch, with a sketch selected in the Part Navigator.
  rerender(<EditRibbon tools={PART_TOOLS} edit={edit() as never} onSketch={onSketch} sketchLabel="Edit Sketch" />);
  expect(layout()).toEqual({ 'Direct Sketch': ['Edit Sketch'] });
});

it("brings the Sketch tab to the front while a sketch is open, and Finish Sketch returns to Solid", async () => {
  const user = userEvent.setup();
  const sketching = edit({ sketch: SKETCH });
  const { rerender } = render(<EditRibbon tools={PART_TOOLS} edit={edit() as never} />);
  await user.click(screen.getByRole('tab', { name: 'Inspect' }));
  expect(frontTab()).toBe('Inspect');
  // The sketch task environment as it has been: its own tools, Finish Sketch first.
  rerender(<EditRibbon tools={PART_TOOLS} edit={sketching as never} />);
  expect(tabNames()).toEqual(['Sketch']);
  expect(frontTab()).toBe('Sketch');
  expect(Object.keys(layout())).toEqual(['Sketch', 'Curve', 'Edit Curve', 'Constraints', 'Feature']);
  expect(commandsIn('Sketch')).toEqual(['Finish Sketch', 'Orient View to Sketch']);
  await user.click(command('Sketch', 'Finish Sketch'));
  expect(sketching.exitSketch).toHaveBeenCalledTimes(1);
  // It ends: Solid, not the tab it was opened from.
  rerender(<EditRibbon tools={PART_TOOLS} edit={edit() as never} />);
  expect(tabNames()).toEqual(['Solid', 'Sketch', 'Inspect', 'Drafting']);
  expect(frontTab()).toBe('Solid');
});

/**
 * jsdom lays nothing out: each group is 120px wide with its names and 80px without them, and the row
 * 400px, less the More button's 46px while it stands beside the row. Returns the undo.
 */
function layOutRibbon() {
  const keys = ['offsetWidth', 'clientWidth'] as const;
  const saved = keys.map(key => Object.getOwnPropertyDescriptor(HTMLElement.prototype, key));
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get(this: HTMLElement) {
    if (this.hasAttribute('data-cad-ribbon-group')) return this.closest('[data-compact="true"]') ? 80 : 120;
    return this.hasAttribute('data-cad-ribbon-more') ? 46 : 0;
  } });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get(this: HTMLElement) {
    if (!this.hasAttribute('data-compact')) return 0;
    return this.parentElement?.querySelector('[data-cad-ribbon-more]') ? 354 : 400;
  } });
  return () => keys.forEach((key, index) => {
    const descriptor = saved[index];
    if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor); else delete (HTMLElement.prototype as any)[key];
  });
}

it("pins Ask the agent at the toolbar's right end, and still folds the groups into More where the row is narrow", () => {
  const restore = layOutRibbon();
  try {
    render(<EditRibbon tools={PART_TOOLS} edit={edit() as never} onAsk={vi.fn()} />);
    // A folded group is hidden from the accessibility tree, so it has no name to be found by.
    const labelled = (title: string) => document.querySelector<HTMLElement>(`[role="group"][aria-label="${title}"]`)!;
    // At the row's right end, as the design has it, whatever room there is before it.
    expect(labelled('Ask the agent').className).toMatch(/\bml-auto\b/);
    // Six groups need 720px with their names and 480px without: the names go, then the groups at the
    // right fold behind More, Ask the agent among them.
    expect(screen.getByRole('button', { name: 'More commands' })).toBeTruthy();
    expect(['Inspect', 'Select', 'Ask the agent'].map(title => labelled(title).getAttribute('aria-hidden'))).toEqual([null, 'true', 'true']);
    expect(command('Create', 'Extrude').textContent).toBe('');
  } finally {
    restore();
  }
});
