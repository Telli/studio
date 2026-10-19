import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import EditCommand from '../../../../dist/renderers/step/edit/EditCommand.js';

afterEach(cleanup);

const ROWS = [{ key: 'block.py:6', kind: 'Box', inputs: [] }, { key: 'block.py:7', kind: 'Hole', inputs: [] }];
const NAMES = [{ key: 'block.py:6', kind: 'Box', title: 'Box1', name: '' }, { key: 'block.py:7', kind: 'Hole', title: 'Hole1', name: '' }];
const EDGE = { id: 'ref-e3', selectorType: 'edge', displaySelector: 'e3', pickData: { curveType: 'line', center: [0, 5, 2], length: 20 } };

function edit(command: string, selected = 'block.py:6') {
  return { command, selected, status: 'ready', saving: false, state: { units: 'mm', rows: ROWS }, run: vi.fn(), close: vi.fn(),
    select: vi.fn(), setPreview: vi.fn() };
}

it('a fillet waits for edges, then OK writes it with the radius typed', async () => {
  const user = userEvent.setup();
  const fillet = edit('fillet');
  const { rerender } = render(<EditCommand edit={fillet as never} names={NAMES} references={[]} />);
  // Choose names the pick wanted, and the empty box says how to pick.
  expect(screen.getByText('1 of 1: Select edges to round')).toBeTruthy();
  expect(screen.getByText('Click edges on the model to add them. Click one again to take it out.')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'OK' }) as HTMLButtonElement).disabled).toBe(true);

  // An edge picked on the model while the panel is open is listed, and OK can go.
  rerender(<EditCommand edit={fillet as never} names={NAMES} references={[EDGE]} />);
  expect(screen.getByText('Edge 3')).toBeTruthy();
  const radius = screen.getByRole('textbox', { name: 'Radius' });
  await user.clear(radius);
  await user.type(radius, '2.5{Enter}');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  expect(fillet.run).toHaveBeenCalledWith({
    command: 'fillet', inputs: { radius: '2.5' },
    selection: [{ selector: 'e3', type: 'line', center: [0, 5, 2], size: 20 }],
  });
});

it('a pattern copies the feature picked in the history, and Cancel leaves the script alone', async () => {
  const user = userEvent.setup();
  const pattern = edit('pattern', 'block.py:7');
  render(<EditCommand edit={pattern as never} names={NAMES} references={[]} />);
  await user.click(screen.getByRole('button', { name: 'OK' }));
  expect(pattern.run).toHaveBeenCalledWith({
    command: 'pattern', selection: [], inputs: { type: 'linear', count: '3', direction: 'X', spacing: '10' },
    feature: { row: 'block.py:7', name: 'Hole1' },
  });
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(pattern.close).toHaveBeenCalled();
});

it('Choose lists each pick with an X to take it out, and Preview asks for what OK would make and says what it drew', async () => {
  const user = userEvent.setup();
  const fillet = { ...edit('fillet'), previewOn: true, featurePreview: null, previewFeature: vi.fn(), setPreviewOn: vi.fn() };
  const onDeselect = vi.fn();
  const { rerender } = render(<EditCommand edit={fillet as never} names={NAMES} references={[EDGE]} onDeselect={onDeselect} />);
  expect(screen.getByText('Review the preview, then press OK.')).toBeTruthy();
  const request = { command: 'fillet', inputs: { radius: '1' }, selection: [{ selector: 'e3', type: 'line', center: [0, 5, 2], size: 20 }] };
  await waitFor(() => expect(fillet.previewFeature).toHaveBeenLastCalledWith(request));
  await user.click(screen.getByRole('button', { name: 'Remove Edge 3' }));
  expect(onDeselect).toHaveBeenCalledWith('ref-e3');

  // While it is made, then what it takes away, then why it could not be made.
  rerender(<EditCommand edit={{ ...fillet, featurePreview: { status: 'updating' } } as never} names={NAMES} references={[EDGE]} onDeselect={onDeselect} />);
  expect(screen.getByText('Updating the preview')).toBeTruthy();
  rerender(<EditCommand edit={{ ...fillet, featurePreview: { status: 'ready', removed: { positions: [], triangles: [], edges: [] }, added: null } } as never}
    names={NAMES} references={[EDGE]} onDeselect={onDeselect} />);
  expect(screen.getByText('Material it takes away')).toBeTruthy();
  expect(screen.queryByText('Material it adds')).toBeNull();
  rerender(<EditCommand edit={{ ...fillet, featurePreview: { status: 'failed', error: 'Try a smaller radius.' } } as never} names={NAMES} references={[EDGE]}
    onDeselect={onDeselect} />);
  expect(screen.getByText('Try a smaller radius.')).toBeTruthy();

  // Preview switched off: none asked, and the line asks only for OK.
  await user.click(screen.getByRole('checkbox', { name: 'Preview' }));
  expect(fillet.setPreviewOn).toHaveBeenCalledWith(false);
  rerender(<EditCommand edit={{ ...fillet, previewOn: false } as never} names={NAMES} references={[EDGE]} onDeselect={onDeselect} />);
  expect(screen.getByText('Press OK to make it.')).toBeTruthy();
  await waitFor(() => expect(fillet.previewFeature).toHaveBeenLastCalledWith(null));
});

it('each command that goes somewhere previews the way it goes: an extrude its depth, a hole into its face, a mirror its plane', () => {
  // A sketch selected in the design tree, made a solid of by Extruded Boss/Base.
  const sketch = { id: 'block.py:9', title: 'Sketch1', plane: 'Top', file: 'block.py', line: 9, constrained: true };
  const tree = { assembly: false, features: [{ id: 'block.py:9', kind: 'Sketch', title: 'Sketch1', rows: [], sketch }] };
  const extrude = edit('extrude', 'block.py:9');
  render(<EditCommand edit={extrude as never} names={NAMES} references={[]} tree={tree} />);
  expect(extrude.setPreview).toHaveBeenLastCalledWith({ kind: 'boss', end: 'blind', file: 'block.py', line: 9, taper: 0, depth: 5, reverse: false,
    units: 'mm', label: '5 mm', onDepth: expect.any(Function), onReverse: expect.any(Function) });
  cleanup();
  // A hole goes into the face picked, through all as it opens.
  const hole = edit('hole');
  const FACE = { id: 'ref-f1', selectorType: 'face', displaySelector: 'f1', pickData: { surfaceType: 'plane', center: [0, 0, 2], normal: [0, 0, 1], area: 200 } };
  render(<EditCommand edit={hole as never} names={NAMES} references={[FACE]} />);
  expect(hole.setPreview).toHaveBeenLastCalledWith({ mark: 'hole', at: [0, 0, 2], into: [0, 0, -1], label: 'Through All' });
  cleanup();
  const mirror = edit('mirror');
  render(<EditCommand edit={mirror as never} names={NAMES} references={[]} />);
  expect(mirror.setPreview).toHaveBeenLastCalledWith({ mark: 'mirror', plane: 'YZ' });
});
