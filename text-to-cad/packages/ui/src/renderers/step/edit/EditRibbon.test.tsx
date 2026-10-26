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
  // A view whose strip has no drawing tools, and a host with nothing to ask: no group at all.
  const UNDRAWN = PART_TOOLS.filter(each => each.id !== 'pencil' && each.id !== 'shapes');
  const { rerender } = render(<EditRibbon tools={UNDRAWN} edit={edit() as never} />);
  expect(screen.queryByRole('group', { name: 'Ask the agent' })).toBeNull();
  expect(Object.keys(layout())).toEqual(['Create', 'Modify', 'Construct', 'Inspect', 'Select']);
  // With Ask to wire, the group is there with Ask alone: Add to context and Annotate wait for what they need.
  rerender(<EditRibbon tools={UNDRAWN} edit={edit() as never} onAsk={onAsk} />);
  expect(Object.keys(layout()).at(-1)).toBe('Ask the agent');
  expect(commandsIn('Ask the agent')).toEqual(['Ask']);
  await user.click(command('Ask the agent', 'Ask'));
  expect(onAsk).toHaveBeenCalledTimes(1);
  rerender(<EditRibbon tools={UNDRAWN} edit={edit() as never} onAsk={onAsk} onAddContext={vi.fn()} />);
  expect(commandsIn('Ask the agent')).toEqual(['Ask', 'Add to context']);
  // The strip's Pencil is Annotate, whatever the host has to ask with.
  rerender(<EditRibbon tools={PART_TOOLS} edit={edit() as never} onAsk={onAsk} onAddContext={vi.fn()} />);
  expect(commandsIn('Ask the agent')).toEqual(['Ask', 'Add to context', 'Annotate']);
  rerender(<EditRibbon tools={PART_TOOLS} edit={edit() as never} />);
  expect(commandsIn('Ask the agent')).toEqual(['Annotate']);
});

it("holds Annotate in Ask the agent: the viewer's Pencil, with Shapes in its menu as a sketch tool family's flyout has its tools", async () => {
  const user = userEvent.setup();
  // Each drawing tool shows what it draws with, as the strip draws it (`ToolIcon` by `drawingToolVariant`).
  const drawing = (id: string, label: string, variant: string, active = false) =>
    ({ ...tool(id, label), icon: <svg data-icon={variant} />, active });
  const tools = (pencil = drawing('pencil', 'Pencil', 'freedraw'), shapes = drawing('shapes', 'Shapes', 'rectangle')) =>
    [...PART_TOOLS.filter(each => each.id !== 'pencil' && each.id !== 'shapes'), pencil, shapes];
  const [pencil, shapes] = [drawing('pencil', 'Pencil', 'highlighter'), drawing('shapes', 'Shapes', 'rectangle')];
  const { rerender } = render(<EditRibbon tools={tools(pencil, shapes)} edit={edit() as never} onAsk={vi.fn()} />);
  const annotate = () => command('Ask the agent', 'Annotate');
  const icon = () => annotate().querySelector('svg')?.getAttribute('data-icon');
  // The button takes up the Pencil, and shows what it draws with.
  expect([icon(), annotate().getAttribute('aria-pressed')]).toEqual(['highlighter', 'false']);
  await user.click(annotate());
  expect([pencil.onSelect.mock.calls.length, shapes.onSelect.mock.calls.length]).toEqual([1, 0]);
  // Its chevron lists both, each as the strip shows it; Shapes picked there takes it up and is the button from then on.
  await user.click(screen.getByRole('button', { name: 'Annotate tools' }));
  const menu = screen.getByRole('menu', { name: 'Annotate tools' });
  expect(within(menu).getAllByRole('menuitemcheckbox').map(item => [item.textContent, item.querySelector('svg')?.getAttribute('data-icon')]))
    .toEqual([['Pencil', 'highlighter'], ['Shapes', 'rectangle']]);
  await user.click(within(menu).getByRole('menuitemcheckbox', { name: /Shapes/ }));
  expect(shapes.onSelect).toHaveBeenCalledTimes(1);
  rerender(<EditRibbon tools={tools(pencil, drawing('shapes', 'Shapes', 'arrow', true))} edit={edit() as never} onAsk={vi.fn()} />);
  expect([icon(), annotate().getAttribute('aria-pressed')]).toEqual(['arrow', 'true']);
  // Put down, it stays the one last picked; the Pencil in hand is the button again.
  rerender(<EditRibbon tools={tools(pencil, shapes)} edit={edit() as never} onAsk={vi.fn()} />);
  expect(icon()).toBe('rectangle');
  await user.click(annotate());
  expect(shapes.onSelect).toHaveBeenCalledTimes(2);
  rerender(<EditRibbon tools={tools(drawing('pencil', 'Pencil', 'eraser', true), shapes)} edit={edit() as never} onAsk={vi.fn()} />);
  expect([icon(), annotate().getAttribute('aria-pressed')]).toEqual(['eraser', 'true']);
  // The group's menu has both too, and the one taken up there is the button's from then on, as from its own menu.
  rerender(<EditRibbon tools={tools(pencil, shapes)} edit={edit() as never} onAsk={vi.fn()} />);
  expect(icon()).toBe('rectangle');
  await user.click(screen.getByRole('button', { name: 'Ask the agent commands' }));
  const groupMenu = screen.getByRole('menu');
  expect([...within(groupMenu).getAllByRole('menuitem'), ...within(groupMenu).getAllByRole('menuitemcheckbox')].map(item => item.textContent))
    .toEqual(['Ask', 'Pencil', 'Shapes']);
  await user.click(within(groupMenu).getByRole('menuitemcheckbox', { name: /Pencil/ }));
  expect(pencil.onSelect).toHaveBeenCalledTimes(2);
  expect(icon()).toBe('highlighter');
});

it("dims Add to context, saying what to select, until something is picked or drawn", async () => {
  const user = userEvent.setup();
  const onAddContext = vi.fn();
  const { rerender } = render(<EditRibbon tools={PART_TOOLS} edit={edit() as never} onAsk={vi.fn()} onAddContext={onAddContext} />);
  const add = () => command('Ask the agent', 'Add to context') as HTMLButtonElement;
  // With nothing picked or drawn (`useAddToContext`'s `picked`) it has nothing to add: dimmed, with its reason as the dimmed buttons of
  // the toolbar give theirs. Ask is not held, nor Annotate, which draws what it would add.
  expect(commandsIn('Ask the agent')).toEqual(['Ask', 'Add to context', 'Annotate']);
  expect((command('Ask the agent', 'Annotate') as HTMLButtonElement).disabled).toBe(false);
  expect(add().disabled).toBe(true);
  expect(add().getAttribute('aria-description')).toBe('Select a face, edge or feature first');
  expect((command('Ask the agent', 'Ask') as HTMLButtonElement).disabled).toBe(false);
  await user.click(add());
  expect(onAddContext).not.toHaveBeenCalled();
  // Picked, it adds.
  rerender(<EditRibbon tools={PART_TOOLS} edit={edit() as never} onAsk={vi.fn()} onAddContext={onAddContext} picked />);
  expect(add().disabled).toBe(false);
  expect(add().getAttribute('aria-description')).toBeNull();
  await user.click(add());
  expect(onAddContext).toHaveBeenCalledTimes(1);
  // Where the host has no chat box to fill it is not dimmed but left out; Ask stays, and Annotate.
  rerender(<EditRibbon tools={PART_TOOLS} edit={edit() as never} onAsk={vi.fn()} picked />);
  expect(commandsIn('Ask the agent')).toEqual(['Ask', 'Annotate']);
});

it("dims Ask and Add to context while a command is open, whose picks they would empty, with the reason Simple view's switch gives for the same hold", async () => {
  const user = userEvent.setup();
  const onAsk = vi.fn(), onAddContext = vi.fn();
  const agent = (props: Record<string, unknown> = {}) =>
    <EditRibbon tools={PART_TOOLS} edit={edit() as never} onAsk={onAsk} onAddContext={onAddContext} picked {...props} />;
  const { rerender } = render(agent({ held: true }));
  const WAIT = 'Finish or cancel the command first';
  const states = () => ['Ask', 'Add to context'].map(name => {
    const button = command('Ask the agent', name) as HTMLButtonElement;
    return [button.disabled, button.getAttribute('aria-description')];
  });
  expect(states()).toEqual([[true, WAIT], [true, WAIT]]);
  await user.click(command('Ask the agent', 'Ask'));
  await user.click(command('Ask the agent', 'Add to context'));
  expect([onAsk, onAddContext].map(handler => handler.mock.calls.length)).toEqual([0, 0]);
  // With nothing picked too, the command is what they wait for: picking would not help.
  rerender(agent({ held: true, picked: false }));
  expect(states()).toEqual([[true, WAIT], [true, WAIT]]);
  // Closed, Ask is there again, and Add to context as it is with and without a pick.
  rerender(agent());
  expect(states()).toEqual([[false, null], [false, null]]);
  await user.click(command('Ask the agent', 'Ask'));
  await user.click(command('Ask the agent', 'Add to context'));
  expect([onAsk, onAddContext].map(handler => handler.mock.calls.length)).toEqual([1, 1]);
  rerender(agent({ picked: false }));
  expect(states()).toEqual([[false, null], [true, 'Select a face, edge or feature first']]);
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
    // The strip's Pencil, with Shapes in its menu.
    'Ask the agent': ['Annotate'],
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

it("names each group's menu apart from a command of the same name, the group's word in its name", async () => {
  const user = userEvent.setup();
  render(<EditRibbon tools={ASSEMBLY_TOOLS} edit={edit({ state: { units: 'mm', components: [{ id: 'base' }], drawing: null } }) as never} onAsk={vi.fn()} onNormalTo={vi.fn()} />);
  // Select, Measure, Expressions and Exploded Views are a group and its one command (or a command and the group it is in),
  // so a button called by that name is the command, and one call finds one.
  const menuOf = (title: string) => within(group(title)).getByRole('button', { name: `${title} commands` });
  const namesOnTab = () => screen.getAllByRole('button').map(button => button.getAttribute('aria-label') || '');
  expect(screen.getAllByRole('button', { name: 'Select' })).toHaveLength(1);
  expect(command('Select', 'Select')).toBe(screen.getByRole('button', { name: 'Select' }));
  for (const title of ['Create', 'Modify', 'Construct', 'Inspect', 'Select', 'Ask the agent']) {
    // The title is what the menu shows, and is in the name it is called by.
    expect([menuOf(title).getAttribute('aria-haspopup'), menuOf(title).textContent]).toEqual(['menu', title]);
  }
  await user.click(screen.getByRole('tab', { name: 'Inspect' }));
  expect(screen.getAllByRole('button', { name: 'Measure' })).toHaveLength(1);
  expect(screen.getAllByRole('button', { name: 'Expressions' })).toHaveLength(1);
  for (const title of ['Measure', 'Analyze', 'Section', 'Display', 'Expressions']) expect(menuOf(title).textContent).toBe(title);
  await user.click(screen.getByRole('tab', { name: 'Assemble' }));
  expect(screen.getAllByRole('button', { name: 'Exploded Views' })).toHaveLength(1);
  for (const title of ['Constraints', 'Exploded Views']) expect(menuOf(title).textContent).toBe(title);
  // No two buttons of the toolbar are called alike.
  const names = namesOnTab().filter(Boolean);
  expect(new Set(names).size).toBe(names.length);
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

it("holds the view's own controls and its catching-up at the tab row's right end, before the build status and units", () => {
  // What the frame hands the toolbar of the view (`RendererShell`'s `ribbon(tools, view)`): Projection, Display and
  // Preview as small tiles, and the view catching up.
  const view = { controls: <button type="button" aria-label="Display mode: Solid" />, status: <span>Updating model…</span> };
  const { rerender } = render(<EditRibbon tools={PART_TOOLS} edit={edit() as never} view={view} />);
  const after = (first: Element, second: Element) => Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
  const order = () => {
    const row = screen.getByRole('tablist').parentElement!;
    const display = within(row).getByRole('button', { name: 'Display mode: Solid' }), status = within(row).getByText('Updating model…');
    const build = within(row).getByText(/^(Saved|Editing Sketch1)$/), units = within(row).queryByText('Millimeters') || build;
    return [after(screen.getAllByRole('tab').at(-1)!, display), after(display, status), after(status, build), build === units || after(build, units)];
  };
  expect(order()).toEqual([true, true, true, true]);
  // A sketch's tab row has them too.
  rerender(<EditRibbon tools={PART_TOOLS} edit={edit({ sketch: SKETCH }) as never} view={view} />);
  expect(order()).toEqual([true, true, true, true]);
});

// ---- command search: the box S opens (`CommandSearchBox.jsx`), under the toolbar, listing what the toolbar has ----

const search = () => screen.getByRole('dialog', { name: 'Command search' });
const searchGone = () => expect(screen.queryByRole('dialog', { name: 'Command search' })).toBeNull();
const found = () => within(search()).queryAllByRole('option');
const foundNames = () => found().map(row => row.textContent);
const foundRow = (name: string) => within(search()).getByRole('option', { name });
type Hand = ReturnType<typeof edit>;
/** The toolbar with the box open, as S asks for it: edit mode counts one more ask than it had. */
function openSearch(patch: Record<string, unknown> = {}, props: Record<string, unknown> = {}) {
  const hand = edit({ findAsked: 0, ...patch });
  const view = render(<EditRibbon tools={PART_TOOLS} edit={hand as never} {...props} />);
  const ask = () => { hand.findAsked = (hand.findAsked as number) + 1; view.rerender(<EditRibbon tools={PART_TOOLS} edit={hand as never} {...props} />); };
  ask();
  return { hand: hand as Hand, ask, ...view };
}
const PART_NAMES = ['Sketch', 'Extrude', 'Extrude Subtract', 'Revolve', 'Revolve Subtract', 'Sweep along Guide', 'Sweep along Guide Subtract',
  'Through Curves', 'Through Curves Subtract', 'Rib', 'Hole', 'Pattern Feature', 'Mirror Feature', 'Edge Blend', 'Chamfer', 'Shell', 'Draft',
  'Split Body', 'Delete Body', 'Datum Plane', 'Measure', 'Edit Section', 'Measure Bodies', 'Draft Analysis', 'Simple Interference', 'Compare',
  'Orient View', 'Edit Object Display', 'Expressions', 'New Sheet'];
const ASSEMBLY = { units: 'mm', components: [{ id: 'base' }], drawing: null };

it("opens the box when S asks, beside the toolbar and not in it, listing the commands of every tab and not the one in front", () => {
  const { hand } = openSearch();
  expect(foundNames()).toEqual(PART_NAMES);
  // The toolbar clips what overflows it, so the box is its neighbour; the Solid tab is in front all the while.
  expect(screen.getByRole('toolbar').contains(search())).toBe(false);
  expect(search().parentElement).toBe(screen.getByRole('toolbar').parentElement);
  expect(frontTab()).toBe('Solid');
  expect(hand.open).not.toHaveBeenCalled();
});

it("opens for each ask made while the toolbar stands, once, and not for one made before it stood", async () => {
  const user = userEvent.setup();
  const hand = edit({ findAsked: 2 });
  const view = render(<EditRibbon tools={PART_TOOLS} edit={hand as never} />);
  searchGone();
  hand.findAsked = 3;
  view.rerender(<EditRibbon tools={PART_TOOLS} edit={hand as never} />);
  expect(search()).toBeTruthy();
  // Put away, it stays so through the toolbar being drawn again, until it is asked for once more.
  await user.keyboard('{Escape}');
  searchGone();
  view.rerender(<EditRibbon tools={PART_TOOLS} edit={hand as never} />);
  searchGone();
  hand.findAsked = 4;
  view.rerender(<EditRibbon tools={PART_TOOLS} edit={hand as never} />);
  expect(search()).toBeTruthy();
});

it("shows the search in the tab row, as NX's Command Finder is, and opens the box from it as S does", async () => {
  const user = userEvent.setup();
  const hand = edit({ findAsked: 0 });
  render(<EditRibbon tools={PART_TOOLS} edit={hand as never} />);
  searchGone();
  const finder = screen.getByRole('button', { name: /Search commands/ });
  expect(finder.textContent).toContain('S');
  await user.click(finder);
  expect(foundNames()).toEqual(PART_NAMES);
});

it("lists only the tabs the toolbar has: Assemble for an assembly, Drawing and Edit Sheet for a part that has its sheet", () => {
  const withSheet = openSearch({ state: { units: 'mm', components: [], drawing: { sheets: 1 } } });
  expect(foundNames()).toEqual(expect.arrayContaining(['Drawing', 'Edit Sheet']));
  for (const name of ['New Sheet', 'Assembly Constraints', 'Exploded Views']) expect(foundNames()).not.toContain(name);
  withSheet.unmount();
  openSearch({ state: ASSEMBLY }, { tools: ASSEMBLY_TOOLS });
  expect(foundNames()).toEqual(expect.arrayContaining(['Assembly Constraints', 'Exploded Views', 'Simple Interference']));
  // An assembly has no body of its own to analyze or color, and no sheet.
  for (const name of ['Draft Analysis', 'Compare', 'Edit Object Display', 'New Sheet', 'Edit Sheet']) expect(foundNames()).not.toContain(name);
});

it("runs a command through the toolbar's own onCommand, a fillet and a cut by the words other tools use", async () => {
  const user = userEvent.setup();
  const onCommand = vi.fn();
  const first = openSearch({}, { onCommand });
  await user.keyboard('round{Enter}');
  expect(onCommand).toHaveBeenLastCalledWith('fillet');
  searchGone();
  first.unmount();
  const second = openSearch({}, { onCommand });
  await user.keyboard('pocket{Enter}');
  expect(onCommand).toHaveBeenLastCalledWith('cut');
  expect(onCommand).toHaveBeenCalledTimes(2);
  expect(second.hand.open).not.toHaveBeenCalled();
});

it("leaves the command open that is already open, and turns an open Extrude to its Subtract", async () => {
  const user = userEvent.setup();
  const onCommand = vi.fn();
  const open = openSearch({ command: 'extrude' }, { onCommand });
  await user.keyboard('extrude{Enter}');
  expect(onCommand).not.toHaveBeenCalled();
  expect(open.hand.close).not.toHaveBeenCalled();
  open.unmount();
  const turned = openSearch({ command: 'extrude' }, { onCommand });
  await user.keyboard('cut{Enter}');
  expect(onCommand).toHaveBeenCalledWith('cut');
  expect(turned.hand.close).not.toHaveBeenCalled();
});

it("starts Sketch as the Sketch button does, and leaves one that waits for its plane waiting", async () => {
  const user = userEvent.setup();
  const onSketch = vi.fn();
  const first = openSearch({}, { onSketch });
  await user.keyboard('draw{Enter}');
  expect(onSketch).toHaveBeenCalledTimes(1);
  first.unmount();
  const waiting = openSearch({ picking: true }, { onSketch });
  await user.keyboard('sketch{Enter}');
  expect(onSketch).toHaveBeenCalledTimes(1);
  expect(waiting.hand.stopPicking).not.toHaveBeenCalled();
  waiting.unmount();
  // On a sketch selected in the Part Navigator the button reads Edit Sketch, and so does the box.
  openSearch({}, { onSketch, sketchLabel: 'Edit Sketch' });
  await user.keyboard('edit sk');
  expect(foundNames()).toEqual(['Edit Sketch']);
  await user.keyboard('{Enter}');
  expect(onSketch).toHaveBeenCalledTimes(2);
});

it("opens an Inspect panel as its button does, from any tab, and leaves one that is open", async () => {
  const user = userEvent.setup();
  const first = openSearch();
  expect(frontTab()).toBe('Solid');
  await user.keyboard('draft analysis{Enter}');
  expect(first.hand.inspect).toHaveBeenCalledWith('draft');
  first.unmount();
  const open = openSearch({ inspecting: 'draft' });
  await user.keyboard('draft analysis{Enter}');
  expect(open.hand.inspect).not.toHaveBeenCalled();
  expect(open.hand.stopInspecting).not.toHaveBeenCalled();
  open.unmount();
  const weighed = openSearch();
  await user.keyboard('mass properties{Enter}');
  expect(weighed.hand.inspect).toHaveBeenCalledWith('mass');
});

it("selects a tool of the strip as its button does, and not again one that is in hand", async () => {
  const user = userEvent.setup();
  const section = tool('clip', 'Clip');
  const measure = { ...tool('measure', 'Measure'), active: true };
  const tools = [tool('references', 'Select'), measure, section];
  const first = openSearch({}, { tools });
  await user.keyboard('section{Enter}');
  expect(section.onSelect).toHaveBeenCalledTimes(1);
  first.ask();
  await user.keyboard('distance{Enter}');
  expect(measure.onSelect).not.toHaveBeenCalled();
  searchGone();
});

it("lists a command the toolbar shows dimmed as dimmed, with the toolbar's reason, and runs none of them", async () => {
  const user = userEvent.setup();
  const onCommand = vi.fn();
  openSearch({ state: ASSEMBLY }, { onCommand, tools: ASSEMBLY_TOOLS, canOpenParts: true });
  await user.keyboard('extrude');
  expect(foundRow('Extrude').getAttribute('aria-disabled')).toBe('true');
  expect(within(search()).getByRole('status').textContent).toBe('An assembly places its parts. Double-click a part in the Part Navigator to open it and model it.');
  await user.keyboard('{Enter}');
  expect(onCommand).not.toHaveBeenCalled();
  expect(search()).toBeTruthy();
  // The same buttons are dimmed in the toolbar.
  await user.keyboard('{Escape}');
  expect((command('Create', 'Extrude') as HTMLButtonElement).disabled).toBe(true);
});

it("dims what the toolbar dims while a change is made, and Orient View until there is something to look at", async () => {
  const user = userEvent.setup();
  const onNormalTo = vi.fn();
  const busy = openSearch({ saving: true });
  const dimmed = found().filter(row => row.getAttribute('aria-disabled') === 'true').map(row => row.textContent);
  expect(dimmed).toEqual(expect.arrayContaining(['Sketch', 'Extrude', 'Hole', 'Datum Plane', 'New Sheet']));
  expect(busy.hand.open).not.toHaveBeenCalled();
  busy.unmount();
  const nothing = openSearch({}, { onNormalTo: null });
  await user.keyboard('orient');
  expect(foundRow('Orient View').getAttribute('aria-disabled')).toBe('true');
  expect(within(search()).getByRole('status').textContent).toMatch(/Select a flat face/);
  await user.keyboard('{Enter}');
  expect(onNormalTo).not.toHaveBeenCalled();
  nothing.unmount();
  openSearch({}, { onNormalTo });
  await user.keyboard('look at{Enter}');
  expect(onNormalTo).toHaveBeenCalledTimes(1);
});

it("lists a sketch's own tools and the features made of it while a sketch is open, and runs each as its button does", async () => {
  const user = userEvent.setup();
  const onCommand = vi.fn();
  const exitSketch = vi.fn().mockResolvedValue({ ok: true });
  const first = openSearch({ sketch: SKETCH, exitSketch }, { onCommand });
  const names = foundNames();
  expect(names.slice(0, 2)).toEqual(['Finish Sketch', 'Orient View to Sketch']);
  expect(names).toEqual(expect.arrayContaining(['Line', 'Rectangle by 2 Points', 'Rectangle from Center', 'Circle by 3 Points', 'Tangent Arc',
    'Slot from Center', 'Studio Spline', 'Rapid Dimension', 'Convert To/From Reference', 'Quick Trim', 'Copy Curve', 'Circular Pattern Curve']));
  // The features it is made into, but not what the sketch environment does not have.
  expect(names).toEqual(expect.arrayContaining(['Extrude', 'Extrude Subtract', 'Revolve', 'Sweep along Guide', 'Through Curves', 'Rib']));
  for (const name of ['Hole', 'Edge Blend', 'Datum Plane', 'Measure', 'Sketch', 'Draft Analysis', 'New Sheet', 'Mirror Feature']) expect(names).not.toContain(name);
  // Fillet is the sketch's own fillet here.
  await user.keyboard('fillet');
  expect(foundNames()).toEqual(['Fillet']);
  await user.keyboard('{Enter}');
  expect(first.hand.setSketchTool).toHaveBeenCalledWith('fillet');
  expect(onCommand).not.toHaveBeenCalled();
  first.unmount();
  // A feature finishes the sketch first, then opens, as its button in the Feature group does.
  const made = openSearch({ sketch: SKETCH, exitSketch }, { onCommand });
  await user.keyboard('pocket{Enter}');
  await vi.waitFor(() => expect(onCommand).toHaveBeenCalledWith('cut'));
  expect(exitSketch).toHaveBeenCalledTimes(1);
  expect(made.hand.open).not.toHaveBeenCalled();
});

it("leaves the sketch tool in hand in hand when its name is run, and finishes the sketch from the box", async () => {
  const user = userEvent.setup();
  const holding = openSearch({ sketch: SKETCH, sketchTool: 'line' });
  await user.keyboard('line{Enter}');
  expect(holding.hand.setSketchTool).not.toHaveBeenCalled();
  holding.unmount();
  const done = openSearch({ sketch: SKETCH });
  await user.keyboard('finish{Enter}');
  expect(done.hand.exitSketch).toHaveBeenCalledTimes(1);
});

it("presses Convert To/From Reference whether it is on or off, as it is a switch", async () => {
  const user = userEvent.setup();
  const off = openSearch({ sketch: SKETCH });
  await user.keyboard('construction{Enter}');
  expect(off.hand.setConstruction).toHaveBeenCalledWith(true);
  off.unmount();
  const on = openSearch({ sketch: SKETCH, construction: true });
  await user.keyboard('construction{Enter}');
  expect(on.hand.setConstruction).toHaveBeenCalledWith(false);
});

// What the toolbar has: every group's whole menu, tab by tab, and a sketch's flyouts. A menu names a tool by its key too ("Line (L)").
const unkeyed = (text: string) => text.replace(/ \([A-Z]\)$/, '');
async function menuOf(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement) {
  await user.click(trigger);
  const menu = screen.getByRole('menu');
  const names = [...within(menu).queryAllByRole('menuitem'), ...within(menu).queryAllByRole('menuitemcheckbox')].map(row => unkeyed(row.textContent || ''));
  await user.keyboard('{Escape}');
  return names;
}
async function toolbarHas(user: ReturnType<typeof userEvent.setup>) {
  const names = new Set<string>();
  const titles = () => screen.getAllByRole('button').filter(button => button.getAttribute('aria-haspopup') === 'menu' && button.getAttribute('aria-label') !== 'More commands');
  for (const tab of screen.getAllByRole('tab')) {
    await user.click(tab);
    for (const trigger of titles()) (await menuOf(user, trigger)).forEach(name => names.add(name));
  }
  return names;
}

it("never disagrees with the toolbar: it lists each command of every tab the toolbar has, under the same name, and nothing else", async () => {
  const user = userEvent.setup();
  // The strip's Select and the agent's buttons (Annotate's menu: the strip's Pencil and Shapes) are the toolbar's, and no CAD command.
  const NOT_CAD = new Set(['Select', 'Ask', 'Add to context', 'Pencil', 'Shapes']);
  const states: [string, Record<string, unknown>, Record<string, unknown>][] = [
    ['a part', {}, {}],
    ['a part with its sheet', { state: { units: 'mm', components: [], drawing: { sheets: 1 } } }, {}],
    ['an assembly', { state: ASSEMBLY }, { tools: ASSEMBLY_TOOLS }],
  ];
  for (const [name, patch, props] of states) {
    const shown = { onNormalTo: vi.fn(), onAsk: vi.fn(), onAddContext: vi.fn(), ...props };
    const hand = edit({ findAsked: 0, ...patch });
    const view = render(<EditRibbon tools={PART_TOOLS} edit={hand as never} {...shown} />);
    const has = await toolbarHas(user);
    hand.findAsked = 1;
    view.rerender(<EditRibbon tools={PART_TOOLS} edit={hand as never} {...shown} />);
    // A cut is the Subtract of its command's Boolean: the toolbar has it in Extrude's dialog, not as a button.
    const listed = new Set(foundNames().filter(text => !text.endsWith('Subtract')));
    expect([name, [...listed].sort()]).toEqual([name, [...has].filter(each => !NOT_CAD.has(each)).sort()]);
    cleanup();
  }
});

it("never disagrees with the toolbar while a sketch is open: every tool of every flyout, and the Feature group", async () => {
  const user = userEvent.setup();
  const hand = edit({ findAsked: 0, sketch: SKETCH });
  const view = render(<EditRibbon tools={PART_TOOLS} edit={hand as never} />);
  const has = new Set(screen.getAllByRole('group').flatMap(group => commandButtons(group).map(button => button.getAttribute('aria-label') || '')));
  // A family's button is the tool last picked of it; its flyout has them all.
  for (const flyout of ['Rectangle tools', 'Circle tools', 'Arc tools', 'Slot tools', 'Move Curve tools']) {
    (await menuOf(user, screen.getByRole('button', { name: flyout }))).forEach(name => has.add(name));
  }
  hand.findAsked = 1;
  view.rerender(<EditRibbon tools={PART_TOOLS} edit={hand as never} />);
  const listed = new Set(foundNames().filter(text => !text.endsWith('Subtract')));
  expect([...listed].sort()).toEqual([...has].sort());
});
