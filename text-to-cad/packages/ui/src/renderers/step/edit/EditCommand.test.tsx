import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import EditCommand from '../../../../dist/renderers/step/edit/EditCommand.js';

afterEach(cleanup);

const ROWS = [{ key: 'block.py:6', kind: 'Box', inputs: [] }, { key: 'block.py:7', kind: 'Hole', inputs: [] }];
const NAMES = [{ key: 'block.py:6', kind: 'Box', title: 'Box1', name: '' }, { key: 'block.py:7', kind: 'Hole', title: 'Hole1', name: '' }];
const EDGE = { selectorType: 'edge', displaySelector: 'e3', pickData: { curveType: 'line', center: [0, 5, 2], length: 20 } };

function edit(command: string, selected = 'block.py:6') {
  return { command, selected, status: 'ready', saving: false, state: { units: 'mm', rows: ROWS }, run: vi.fn(), close: vi.fn() };
}

it('a fillet waits for edges, then OK writes it with the radius typed', async () => {
  const user = userEvent.setup();
  const fillet = edit('fillet');
  const { rerender } = render(<EditCommand edit={fillet as never} names={NAMES} references={[]} />);
  expect(screen.getByText('Select the edges to round.')).toBeTruthy();
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
