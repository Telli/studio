import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import EditTree from '../../../../dist/renderers/step/edit/EditTree.js';
import { featureTree } from '../../../../dist/renderers/step/edit/editMode.js';

afterEach(cleanup);

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
