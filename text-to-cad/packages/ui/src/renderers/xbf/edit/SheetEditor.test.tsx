import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SheetEditor from '../../../../dist/renderers/xbf/edit/SheetEditor.js';

beforeEach(() => {
  // jsdom has no Path2D or 2D canvas: the sheet is prepared into stand-ins, and painted by none.
  vi.stubGlobal('Path2D', class { moveTo() {} lineTo() {} closePath() {} quadraticCurveTo() {} bezierCurveTo() {} arc() {} });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const payload = { schemaVersion: 3, units: 'mm', primitives: [], entities: [], fonts: [], layers: [], bounds: [0, 0, 420, 297], hash: 'h1',
  file: 'plate_drawing.py', sheet: { index: 1, count: 2, size: 'A3', views: [], sources: {}, frame: [10, 410, 10, 287], units: 'mm', warnings: [] } };

it("the sheet's tools: Smart Dimension in hand and put down, Delete waiting for a pick, its own Undo, the next sheet, and Escape putting the sheet away", async () => {
  const user = userEvent.setup();
  const edit = { sheetView: { index: 1, payload, busy: false, error: '', undo: [{ undo: [], redo: [] }], redo: [] },
    closeSheet: vi.fn(), openSheet: vi.fn(), undoSheet: vi.fn(), redoSheet: vi.fn(), sheetEdit: vi.fn() };
  render(<SheetEditor edit={edit as never} />);
  expect(screen.getByRole('region', { name: 'Sheet' })).toBeTruthy();
  expect(screen.getByText('A3, plate_drawing.py. Drag a view to move it. Pick a dimension to delete it, or use Smart Dimension to add one.')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Delete' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Redo' }) as HTMLButtonElement).disabled).toBe(true);

  await user.click(screen.getByRole('button', { name: 'Smart Dimension' }));
  expect(screen.getByRole('button', { name: 'Smart Dimension' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText(/Pick a corner or a circle's centre in a view/)).toBeTruthy();
  // Escape steps back: Smart Dimension put down first.
  await user.keyboard('{Escape}');
  expect(screen.getByRole('button', { name: 'Smart Dimension' }).getAttribute('aria-pressed')).toBe('false');
  expect(edit.closeSheet).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: 'Undo' }));
  expect(edit.undoSheet).toHaveBeenCalled();
  await user.keyboard('{Meta>}z{/Meta}');
  expect(edit.undoSheet).toHaveBeenCalledTimes(2);
  await user.click(screen.getByRole('button', { name: 'Next sheet' }));
  expect(edit.openSheet).toHaveBeenCalledWith(2);
  await user.keyboard('{Escape}');
  expect(edit.closeSheet).toHaveBeenCalled();
});

it('a sheet that could not be drawn says why', () => {
  const edit = { sheetView: { index: 1, payload: null, busy: false, error: 'The drawing did not draw: ValueError: bad scale', undo: [], redo: [] },
    closeSheet: vi.fn(), openSheet: vi.fn(), undoSheet: vi.fn(), redoSheet: vi.fn(), sheetEdit: vi.fn() };
  render(<SheetEditor edit={edit as never} />);
  expect(screen.getByText('The drawing did not draw: ValueError: bad scale')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Smart Dimension' }) as HTMLButtonElement).disabled).toBe(true);
});
