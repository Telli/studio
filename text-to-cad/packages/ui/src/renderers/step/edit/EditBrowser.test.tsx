import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EditBrowser from '../../../../dist/renderers/step/edit/EditBrowser.js';
import { featureTree } from '../../../../dist/renderers/step/edit/editMode.js';

beforeEach(() => vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.querySelectorAll('[data-test-card]').forEach(node => node.remove()); });

const STATE = { units: 'mm', name: 'block', rows: [], params: [], features: [] };
function edit(patch: Record<string, unknown> = {}) {
  return { status: 'ready', saving: false, state: STATE, selected: null, renaming: null, bar: null, sketch: null, command: null, picking: false,
    inspecting: null, error: 'The fillet could not be built.', redraw: null, dismissError: vi.fn(), select: vi.fn(), hover: vi.fn(), ...patch };
}
// The place beside the Part Navigator the frame gives the open command's dialog (`dialogPlace`).
function place() {
  const card = document.createElement('div');
  card.setAttribute('data-test-card', '');
  document.body.append(card);
  return card;
}

it("says what went wrong in the card beside the Part Navigator, so the navigator folded to its title never hides it", () => {
  const card = place();
  const { container } = render(<EditBrowser edit={edit() as never} names={[]} tree={featureTree(STATE)} card={card} />);
  const alert = screen.getByRole('alert');
  expect([card.contains(alert), container.contains(alert), alert.textContent]).toEqual([true, false, 'The fillet could not be built.']);
  cleanup();
  // With a command's dialog open it heads the dialog, in the same card.
  render(<EditBrowser edit={edit({ inspecting: 'expressions', change: vi.fn(), addParameter: vi.fn(), stopInspecting: vi.fn() }) as never}
    names={[]} tree={featureTree(STATE)} card={card} />);
  const dialog = within(card).getByRole('dialog', { name: 'Expressions' });
  expect(Boolean(within(card).getByRole('alert').compareDocumentPosition(dialog) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  cleanup();
  // With no place to float in, it heads the tree, as it did.
  render(<EditBrowser edit={edit() as never} names={[]} tree={featureTree(STATE)} />);
  expect(screen.getByRole('alert').closest('[data-cad-edit-browser]')).not.toBeNull();
});
