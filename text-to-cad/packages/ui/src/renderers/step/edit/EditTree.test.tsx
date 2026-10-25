import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EditTree from '../../../../dist/renderers/step/edit/EditTree.js';
import { featureTree } from '../../../../dist/renderers/step/edit/editMode.js';

beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

// A block filleted, the fillet renamed in the tree, and a sketch nothing uses yet.
const STATE = {
  units: 'mm', name: 'block', params: [], rows: [],
  features: [
    { key: 'block.py:6', kind: 'Boss-Extrude', name: 'part', file: 'block.py', line: 6 },
    { key: 'block.py:7', kind: 'Fillet', name: 'part', file: 'block.py', line: 7, named: 'Top edge round' },
    { key: 'block.py:8', kind: 'Fillet', name: 'part', file: 'block.py', line: 8 },
    { key: 'block.py:9', kind: 'Sketch', file: 'block.py', line: 9,
      sketch: { name: 'Sketch1', plane: 'Top', file: 'block.py', line: 9, status: 'Fully defined' } },
  ],
};

function edit(renaming: string | null = null) {
  return { status: 'ready', saving: false, state: STATE, selected: null, renaming, bar: null, sketch: null,
    select: vi.fn(), hover: vi.fn(), rename: vi.fn(), startRename: vi.fn(), stopRename: vi.fn(), remove: vi.fn(), suppress: vi.fn(),
    rollTo: vi.fn(), editFeature: vi.fn() };
}

it("a renamed feature shows its own name and the tree still counts it, and its name is typed over in place", async () => {
  const user = userEvent.setup();
  const tree = featureTree(STATE);
  expect(tree.features.map((feature: { title: string }) => feature.title)).toEqual(['Boss-Extrude1', 'Top edge round', 'Fillet2', 'Sketch1']);
  const renaming = edit('block.py:8');
  render(<EditTree edit={renaming as never} tree={tree} />);
  const input = screen.getByRole('textbox', { name: 'Name' }) as HTMLInputElement;
  expect(input.value).toBe('Fillet2');
  await user.clear(input);
  await user.type(input, 'Lid edge{Enter}');
  expect(renaming.rename).toHaveBeenCalledWith({ feature: 'block.py:8', title: 'Fillet2' }, 'Lid edge');
  cleanup();
  // Escape leaves it; a sketch is renamed by where it is made.
  const sketch = edit('block.py:9');
  render(<EditTree edit={sketch as never} tree={tree} />);
  await user.type(screen.getByRole('textbox', { name: 'Name' }), 'x{Escape}');
  expect(sketch.stopRename).toHaveBeenCalled();
  expect(sketch.rename).not.toHaveBeenCalled();
});

// A bracket: a plate (an extrude a command made, from a sketch of its own), then a fillet and a hole the
// commands made. Numbered as NX does: Sketch (1), Extrude (2), Edge Blend (3), Hole (4). The engine gives each
// feature its first line as written, and each row of the history its own. The hole is made by a helper the part calls.
const SOURCE = {
  plate: 'plate = extrude(outline, amount=THICKNESS)',
  fillet: 'plate = fillet(plate.edges().filter_by(Axis.Z), radius=WALL)',
  hole: 'plate = drill(plate, HOLE)',
};
const PART = {
  units: 'mm', name: 'bracket',
  rows: [
    { key: 'bracket.py:8', file: 'bracket.py', line: 8, code: SOURCE.plate },
    { key: 'bracket.py:9', file: 'bracket.py', line: 9, code: SOURCE.fillet },
    { key: 'bracket.py:10', file: 'bracket.py', line: 10, code: SOURCE.hole },
  ],
  params: [{ id: 'bracket.py:3', name: 'TRAY_WIDTH', text: '40', unit: 'mm' }, { id: 'bracket.py:4', name: 'WALL', text: '2', unit: 'mm' }],
  features: [
    { key: 'bracket.py:8', kind: 'Boss-Extrude', name: 'plate', file: 'bracket.py', line: 8, text: SOURCE.plate, edit: { command: 'extrude', values: {}, keeps: '' },
      sketch: { name: 'Outline', plane: 'Top', file: 'bracket.py', line: 7, status: 'Fully defined' } },
    { key: 'bracket.py:9', kind: 'Fillet', name: 'plate', file: 'bracket.py', line: 9, text: SOURCE.fillet, edit: { command: 'fillet', values: {}, keeps: '4 edges' } },
    { key: 'bracket.py:10', kind: 'Hole', name: 'plate', file: 'bracket.py', line: 10, text: SOURCE.hole, edit: { command: 'hole', values: {}, keeps: '' } },
  ],
};
const FILLET = 'bracket.py:9', HOLE = 'bracket.py:10';

function part(patch: Record<string, unknown> = {}) {
  return { ...edit(), state: PART, error: '', ...patch };
}
const partTree = () => featureTree(PART);
const row = (title: string) => screen.getByText(title).closest<HTMLElement>('[data-tree-row]')!;

/** The words of a row's menu, opened with a right-click. */
function menuOf(title: string) {
  fireEvent.contextMenu(row(title));
  return screen.getAllByRole('menuitem').map(item => item.textContent);
}

it("opens with the Datum Coordinate System", () => {
  render(<EditTree edit={part() as never} tree={partTree()} />);
  const rows = within(screen.getByRole('tree', { name: 'Part Navigator' })).getAllByRole('treeitem');
  expect(rows[0].textContent).toBe('Datum Coordinate System (0)');
  // Drawn with the generator's coordinate system icon, its planes hanging from it, open.
  expect(rows[0].querySelector('use')?.getAttribute('href')).toBe('#nx-csys');
  expect(rows.slice(1, 4).map(each => each.textContent)).toEqual(['XZ Plane', 'XY Plane', 'YZ Plane']);
  // The features follow, numbered after it: a feature's own name in quotes, its variable name at the right.
  expect(rows.slice(4).map(each => each.textContent)).toEqual(['Extrude (2)Plate', 'Edge Blend (3)Plate', 'Hole (4)Plate']);
});

it("keeps User Expressions folded at the top", async () => {
  const user = userEvent.setup();
  const { container } = render(<EditTree edit={part() as never} tree={partTree()} />);
  const fold = screen.getByRole('button', { name: 'User Expressions' });
  // Above the tree, folded: the part's sizes are not listed until it is opened.
  expect(fold.getAttribute('aria-expanded')).toBe('false');
  expect(Boolean(fold.compareDocumentPosition(screen.getByRole('tree')) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  expect(container.textContent).not.toMatch(/Tray width/);
  expect(screen.queryByRole('textbox', { name: 'Wall value' })).toBeNull();
  // Opened, it lists the part's expressions, typed over in place as the Expressions dialog lists them; folded again, it puts them away.
  await user.click(fold);
  expect(fold.getAttribute('aria-expanded')).toBe('true');
  const list = screen.getByRole('group', { name: 'User Expressions' });
  expect(within(list).getByText('Tray width')).toBeTruthy();
  expect(within(list).getByRole('textbox', { name: 'Wall value' })).toBeTruthy();
  await user.click(fold);
  expect(screen.queryByRole('group', { name: 'User Expressions' })).toBeNull();
});

it("words the row menu as NX does", () => {
  // A feature a command made, with no sketch of its own.
  render(<EditTree edit={part() as never} tree={partTree()} />);
  expect(menuOf('Edge Blend (3)')).toEqual(['Edit Parameters', 'Suppress', 'Rename', 'Delete', 'Make Current Feature']);
  cleanup();
  // With a sketch it edits, Edit Sketch follows.
  render(<EditTree edit={part() as never} tree={partTree()} />);
  expect(menuOf('Extrude (2)')).toEqual(['Edit Parameters', 'Edit Sketch', 'Suppress', 'Rename', 'Delete', 'Make Current Feature']);
  cleanup();
  // A feature no command made has no Edit Parameters.
  render(<EditTree edit={edit() as never} tree={featureTree(STATE)} />);
  expect(menuOf('Extrude (1)')).toEqual(['Suppress', 'Rename', 'Delete', 'Make Current Feature']);
  cleanup();
  // A feature set aside is put back by Unsuppress.
  const aside = { ...PART, features: PART.features.map(feature => (feature.key === FILLET ? { ...feature, suppressed: true } : feature)) };
  render(<EditTree edit={part({ state: aside }) as never} tree={featureTree(aside)} />);
  expect(menuOf('Edge Blend (3)')).toEqual(['Edit Parameters', 'Unsuppress', 'Rename', 'Delete', 'Make Current Feature']);
});

it("words a sketch's menu as NX does", () => {
  const lid = {
    units: 'mm', name: 'lid', params: [], rows: [],
    features: [
      { key: 'lid.py:5', kind: 'Sketch', file: 'lid.py', line: 5, sketch: { name: 'Outline', plane: 'Top', file: 'lid.py', line: 5, status: 'Fully defined' } },
      { key: 'lid.py:9', kind: 'Boss-Extrude', name: 'lid', file: 'lid.py', line: 9, sketch: { name: 'Rim', plane: 'Top', file: 'lid.py', line: 8, status: 'Fully defined' } },
    ],
  };
  // The sketch under the extrude is shown once the extrude is open (selecting it opens its owner).
  render(<EditTree edit={{ ...part({ state: lid }), selected: 'sketch:lid.py:9' } as never} tree={featureTree(lid)} />);
  // A sketch of its own is deleted and can be made current; it is not suppressed on its own.
  expect(menuOf('Sketch (1) "Outline"')).toEqual(['Edit Sketch', 'Rename', 'Delete', 'Make Current Feature']);
  cleanup();
  // The sketch an extrude is made from goes with the extrude.
  render(<EditTree edit={{ ...part({ state: lid }), selected: 'sketch:lid.py:9' } as never} tree={featureTree(lid)} />);
  expect(menuOf('Sketch (2) "Rim"')).toEqual(['Edit Sketch', 'Rename']);
});

it("marks who made a feature with a dot at its row's right, said on hover, its sketch with its own, and one nobody is known to have made with none", () => {
  vi.useFakeTimers();
  const authored = { ...PART, authors: { 'bracket.py:8': 'agent', [FILLET]: 'you', [HOLE]: 'someone else' } };
  // The extrude open, the sketch it was made from under it.
  render(<EditTree edit={part({ state: authored, selected: 'sketch:bracket.py:8' }) as never} tree={featureTree(authored)} />);
  const dot = (title: string) => row(title).querySelector('[data-cad-edit-tree-author]');
  expect(['Sketch (1) "Outline"', 'Extrude (2)', 'Edge Blend (3)', 'Hole (4)'].map(title => dot(title)?.getAttribute('data-cad-edit-tree-author') ?? null))
    .toEqual(['agent', 'agent', 'you', null]);
  // At the row's right, past its variable's name, and named for a screen reader.
  expect(row('Edge Blend (3)').lastElementChild?.contains(dot('Edge Blend (3)'))).toBe(true);
  expect(within(row('Extrude (2)')).getByRole('img', { name: 'Made by the agent' })).toBeTruthy();
  fireEvent.pointerMove(dot('Edge Blend (3)')!.parentElement!, { pointerType: 'mouse' });
  act(() => { vi.advanceTimersByTime(450); });
  expect(screen.getByRole('tooltip').textContent).toBe('Made by you');
  cleanup();
  // A part from before Studio kept track has none.
  render(<EditTree edit={part() as never} tree={partTree()} />);
  expect(document.querySelectorAll('[data-cad-edit-tree-author]').length).toBe(0);
});

it("makes a feature current", async () => {
  const user = userEvent.setup();
  const tree = partTree();
  // On the second of the three features, the rollback bar goes above the third.
  const rolling = part();
  render(<EditTree edit={rolling as never} tree={tree} />);
  fireEvent.contextMenu(row('Edge Blend (3)'));
  await user.click(screen.getByRole('menuitem', { name: 'Make Current Feature' }));
  expect(rolling.rollTo).toHaveBeenCalledWith(HOLE);
  cleanup();
  // On the last, with the part rolled back above the fillet, the bar goes to the end.
  const back = part({ bar: { item: FILLET, before: FILLET } });
  render(<EditTree edit={back as never} tree={tree} />);
  fireEvent.contextMenu(row('Hole (4)'));
  await user.click(screen.getByRole('menuitem', { name: 'Make Current Feature' }));
  expect(back.rollTo).toHaveBeenCalledTimes(1);
  expect(back.rollTo).toHaveBeenCalledWith(null);
  cleanup();
  // It takes the place of Rollback and Roll to End.
  render(<EditTree edit={back as never} tree={tree} />);
  const words = menuOf('Hole (4)');
  expect(words).not.toContain('Rollback');
  expect(words).not.toContain('Roll to End');
});

it("leaves a feature that is current as it is", async () => {
  const user = userEvent.setup();
  const tree = partTree();
  // Nothing rolled back: the last feature is current already.
  const idle = part();
  render(<EditTree edit={idle as never} tree={tree} />);
  fireEvent.contextMenu(row('Hole (4)'));
  const last = screen.getByRole('menuitem', { name: 'Make Current Feature' });
  expect(last.getAttribute('aria-disabled')).toBe('true');
  await user.click(last);
  expect(idle.rollTo).not.toHaveBeenCalled();
  cleanup();
  // The bar just under the fillet: it is the current one.
  render(<EditTree edit={part({ bar: { item: HOLE, before: HOLE } }) as never} tree={tree} />);
  fireEvent.contextMenu(row('Edge Blend (3)'));
  expect(screen.getByRole('menuitem', { name: 'Make Current Feature' }).getAttribute('aria-disabled')).toBe('true');
});

it("keeps the part's own menu above the tree", () => {
  render(<EditTree edit={part() as never} tree={partTree()} />);
  expect(menuOf('Bracket')).toEqual(['Appearance', 'Mass Properties']);
});

it("takes the selected feature out with the Delete key, as it did", () => {
  const selected = part({ selected: FILLET });
  const tree = partTree();
  render(<EditTree edit={selected as never} tree={tree} />);
  fireEvent.keyDown(row('Edge Blend (3)'), { key: 'Delete' });
  expect(selected.remove).toHaveBeenCalledWith(FILLET, tree);
});

it("lists an assembly's parts and mates in the tree, under the same header", () => {
  const stack = {
    units: 'mm', name: 'stack', params: [], rows: [], mates: [{ label: 'mate1', name: 'Coincident1', parts: ['base', 'pin'] }],
    components: [{ file: 'parts/base.py', name: 'base', step: 'parts/base.step',
      features: [{ key: 'parts/base.py:6', kind: 'Boss-Extrude', name: 'base', file: 'parts/base.py', line: 6 }] }],
  };
  render(<EditTree edit={part({ state: stack }) as never} tree={featureTree(stack)} onOpenPart={vi.fn()} />);
  const rows = within(screen.getByRole('tree', { name: 'Part Navigator' })).getAllByRole('treeitem');
  expect(rows.map(each => each.textContent)).toEqual(['Datum Coordinate System (0)', 'XZ Plane', 'XY Plane', 'YZ Plane', 'Base<1>', 'Mates', 'Coincident1 (base, pin)']);
  expect(screen.getByText('Stack')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'User Expressions' })).toBeTruthy();
  expect(menuOf('Base<1>')).toEqual(['Open Part']);
  cleanup();
  render(<EditTree edit={part({ state: stack }) as never} tree={featureTree(stack)} onOpenPart={vi.fn()} />);
  expect(menuOf('Coincident1 (base, pin)')).toEqual(['Delete']);
});

// What the part's script stops with when a fillet cannot be made, as the tracer words it (a real one, its
// paths shortened): build123d's own error, then the tracer's frame, the fillet's line in the part, build123d's.
const failed = (line: number, code = SOURCE.fillet) => [
  'Traceback (most recent call last):',
  '  File "/work/.venv/lib/python3.13/site-packages/build123d/topology/three_d.py", line 367, in fillet',
  '    new_shape = self._make_3d_result(fillet_builder.Shape())',
  'OCP.OCP.Standard.Standard_Failure: BRep_API: command not done',
  '',
  'The above exception was the direct cause of the following exception:',
  '',
  'Traceback (most recent call last):',
  '  File "/work/packages/cadgen/src/cadgen/edit/tracer.py", line 1668, in trace',
  '    shape = model.func()',
  `  File "/work/parts/bracket.py", line ${line}, in bracket`,
  `    ${code}`,
  '  File "/work/.venv/lib/python3.13/site-packages/build123d/topology/three_d.py", line 371, in fillet',
  '    raise ValueError(',
  '    ...<2 lines>...',
  'ValueError: Failed creating a fillet with radius of 40, try a smaller value or use max_fillet() to find the largest valid fillet radius',
].join('\n');
const WHY = 'ValueError: Failed creating a fillet with radius of 40, try a smaller value or use max_fillet() to find the largest valid fillet radius';
// How the engine says where the script stopped: the frames of its traceback in the project's own files, deepest
// first, each with the file as the history names it, the line and the line as read.
const at = (line: number, text: string, file = 'bracket.py') => ({ file, line, text });
const stoppedAt = (...frames: ReturnType<typeof at>[]) => ({ frames });
// The line in a helper's file that raised: it makes no row, and the part's call into it is the hole's.
const IN_DRILL = at(4, 'return plate - Pos(10, 0, 0) * Cylinder(radius, height)', 'helpers.py');
// The rows wearing the warning, by their ids.
const markedRows = () => screen.queryAllByRole('img', { name: 'Did not build' }).map(mark => mark.closest('[data-tree-row]')?.getAttribute('data-cad-edit-tree-row'));

it("marks the feature whose build failed with the viewer's warning, and says why on hover", () => {
  render(<EditTree edit={part({ error: failed(9), failure: stoppedAt(at(9, SOURCE.fillet)) }) as never} tree={partTree()} />);
  // The row the engine's file, line and words name, beside its title, in the alert card's amber.
  const marked = row('Edge Blend (3)');
  const mark = within(marked).getByRole('img', { name: 'Did not build' });
  expect(mark.getAttribute('class')).toMatch(/\btext-amber-500\b/);
  expect(marked.getAttribute('title')).toBe(`Did not build: ${WHY}`);
  expect(marked.textContent).toBe('Edge Blend (3)Plate');
  // No other row says it.
  expect(markedRows()).toEqual([FILLET]);
  expect(row('Hole (4)').getAttribute('title')).toBeNull();
});

it("marks the feature that called the helper an error was raised in", () => {
  // The helper's line makes no row; the part's call into it is the hole's, so that is the row.
  render(<EditTree edit={part({ error: failed(10, SOURCE.hole), failure: stoppedAt(IN_DRILL, at(10, SOURCE.hole)) }) as never} tree={partTree()} />);
  expect(markedRows()).toEqual([HOLE]);
  expect(row('Hole (4)').getAttribute('title')).toBe(`Did not build: ${WHY}`);
});

it("marks nothing for a line that moved: the script has moved on from the tree", () => {
  // A line was written above the fillet, and it stands at 10 now, where the last good part's hole was.
  // Neither the hole, which reads otherwise, nor the fillet, which sat at 9, is that line.
  render(<EditTree edit={part({ error: failed(10), failure: stoppedAt(at(10, SOURCE.fillet)) }) as never} tree={partTree()} />);
  expect(markedRows()).toEqual([]);
});

it("marks nothing for a call that moved, though the helper it called is told of", () => {
  // The call into the helper stands at 11 now, where the last good part had nothing; and at 9, where its fillet was.
  render(<EditTree edit={part({ error: failed(11, SOURCE.hole), failure: stoppedAt(IN_DRILL, at(11, SOURCE.hole)) }) as never} tree={partTree()} />);
  expect(markedRows()).toEqual([]);
  cleanup();
  render(<EditTree edit={part({ error: failed(9, SOURCE.hole), failure: stoppedAt(IN_DRILL, at(9, SOURCE.hole)) }) as never} tree={partTree()} />);
  expect(markedRows()).toEqual([]);
});

it("marks nothing for a line the last good part does not hold", () => {
  // The radius typed over in the line itself: no row of the last good part reads so, though one sits at its number.
  const rewritten = 'plate = fillet(plate.edges().filter_by(Axis.Z), radius=40)';
  render(<EditTree edit={part({ error: failed(9, rewritten), failure: stoppedAt(at(9, rewritten)) }) as never} tree={partTree()} />);
  expect(markedRows()).toEqual([]);
  cleanup();
  // The engine found no frame of the part's own (a script that does not parse): nothing, whatever the traceback holds.
  render(<EditTree edit={part({ error: failed(9), failure: null }) as never} tree={partTree()} />);
  expect(markedRows()).toEqual([]);
});

it("marks nothing for an engine that says no line, though the traceback names one", () => {
  render(<EditTree edit={part({ error: failed(9) }) as never} tree={partTree()} />);
  expect(markedRows()).toEqual([]);
});

it("marks nothing for an error that points at no feature", () => {
  const patches = [{ error: 'Another feature is named Lid. Pick another name.' },
    { error: failed(99), failure: stoppedAt(at(99, 'plate = shell(plate, thickness=1)')) }, { error: '' }];
  for (const patch of patches) {
    render(<EditTree edit={part(patch) as never} tree={partTree()} />);
    expect(markedRows()).toEqual([]);
    cleanup();
  }
});
