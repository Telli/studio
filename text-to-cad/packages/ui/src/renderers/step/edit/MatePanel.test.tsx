import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import MatePanel from '../../../../dist/renderers/step/edit/MatePanel.js';

// What a select's list needs of the page that jsdom does not have.
const restores: (() => void)[] = [];
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  for (const [name, value] of Object.entries({ scrollIntoView() {}, hasPointerCapture: () => false, setPointerCapture() {}, releasePointerCapture() {} })) {
    const previous = Object.getOwnPropertyDescriptor(Element.prototype, name);
    Object.defineProperty(Element.prototype, name, { configurable: true, value });
    restores.push(() => (previous ? Object.defineProperty(Element.prototype, name, previous) : delete (Element.prototype as never)[name]));
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); while (restores.length) restores.pop()!(); });

const COMPONENTS = [{ id: 'base', title: 'Base' }, { id: 'pin', title: 'Pin' }];
const TOP = { id: 'ref-top', selectorType: 'face', displaySelector: 'o1.1.f6', pickData: { surfaceType: 'plane', center: [0, 0, 2], area: 200 } };
const FOOT = { id: 'ref-foot', selectorType: 'face', displaySelector: 'o1.2.f3', pickData: { surfaceType: 'plane', center: [-3, 2, 7], area: 7.07 } };

function edit() {
  return { saving: false, state: { units: 'mm' }, mate: vi.fn(async () => ({ ok: true })), stopInspecting: vi.fn() };
}

it("a mate waits for a pick on each part, says which moves, and OK sends the two with the mate and its distance", async () => {
  const user = userEvent.setup();
  const mating = edit();
  const { rerender } = render(<MatePanel edit={mating as never} references={[TOP]} components={COMPONENTS} />);
  expect(screen.getAllByText('Pick a face or an edge on the part that moves to it.').length).toBeGreaterThan(0);
  expect((screen.getByRole('button', { name: 'OK' }) as HTMLButtonElement).disabled).toBe(true);
  rerender(<MatePanel edit={mating as never} references={[TOP, FOOT]} components={COMPONENTS} />);
  expect(screen.getByText('Face 6 of Base')).toBeTruthy();
  expect(screen.getByText('Face 3 of Pin, moves')).toBeTruthy();
  await user.click(screen.getByRole('combobox', { name: 'Mate' }));
  await user.click(screen.getByRole('option', { name: 'Distance' }));
  const distance = screen.getByRole('textbox', { name: 'Distance' });
  await user.clear(distance);
  await user.type(distance, '4{Enter}');
  await user.click(screen.getByRole('checkbox', { name: 'Flip alignment' }));
  await user.click(screen.getByRole('button', { name: 'OK' }));
  expect(mating.mate).toHaveBeenCalledWith({ type: 'distance', distance: '4', flip: true, selection: [
    { selector: 'o1.1.f6', type: 'plane', center: [0, 0, 2], size: 200 },
    { selector: 'o1.2.f3', type: 'plane', center: [-3, 2, 7], size: 7.07 },
  ] });
  expect(mating.stopInspecting).toHaveBeenCalled();
});

it("an Angle mate takes its angle and has no alignment to flip", async () => {
  const user = userEvent.setup();
  const mating = edit();
  render(<MatePanel edit={mating as never} references={[TOP, FOOT]} components={COMPONENTS} />);
  await user.click(screen.getByRole('combobox', { name: 'Mate' }));
  await user.click(screen.getByRole('option', { name: 'Angle' }));
  expect(screen.queryByRole('checkbox', { name: 'Flip alignment' })).toBeNull();
  const angle = screen.getByRole('textbox', { name: 'Angle' });
  await user.clear(angle);
  await user.type(angle, '30{Enter}');
  await user.click(screen.getByRole('button', { name: 'OK' }));
  expect(mating.mate).toHaveBeenCalledWith(expect.objectContaining({ type: 'angle', angle: '30' }));
  expect(mating.mate.mock.calls[0][0]).not.toHaveProperty('flip');
});
