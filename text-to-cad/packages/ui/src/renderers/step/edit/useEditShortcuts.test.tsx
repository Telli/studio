import { cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ViewerElementContext } from '../../../host/context.js';
import { useEditShortcuts } from './useEditShortcuts.js';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

/** A viewer on the page with a button and a text field in it, and edit mode's Undo and Redo. */
function viewer(edit: { canUndo: boolean; canRedo: boolean }) {
  const element = document.createElement('div');
  element.innerHTML = '<button type="button">Fillet</button><input aria-label="Width value" />';
  document.body.append(element);
  const undo = vi.fn(async () => {});
  const redo = vi.fn(async () => {});
  const wrapper = ({ children }: { children: ReactNode }) =>
    <ViewerElementContext.Provider value={{ current: element }}>{children}</ViewerElementContext.Provider>;
  renderHook(() => useEditShortcuts({ ...edit, undo, redo } as never, true), { wrapper });
  return { element, undo, redo };
}

const press = (target: Element, init: KeyboardEventInit) => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

it('Cmd+Z undoes and Shift+Cmd+Z redoes in the viewer, but a text field keeps its own Undo', () => {
  const { element, undo, redo } = viewer({ canUndo: true, canRedo: true });
  const button = element.querySelector('button')!;
  press(button, { key: 'z', metaKey: true });
  press(button, { key: 'z', metaKey: true, shiftKey: true });
  press(button, { key: 'y', ctrlKey: true });
  expect(undo).toHaveBeenCalledTimes(1);
  expect(redo).toHaveBeenCalledTimes(2);
  press(element.querySelector('input')!, { key: 'z', metaKey: true });
  expect(undo).toHaveBeenCalledTimes(1);
});

it('a key outside the viewer, or with nothing to redo, is left alone', () => {
  const { element, undo, redo } = viewer({ canUndo: true, canRedo: false });
  const outside = document.createElement('button');
  document.body.append(outside);
  press(outside, { key: 'z', metaKey: true });
  expect(undo).not.toHaveBeenCalled();
  press(element.querySelector('button')!, { key: 'z', metaKey: true, shiftKey: true });
  expect(redo).not.toHaveBeenCalled();
});

it('F2 renames what the tree has selected, and Cmd+8 turns the view Normal To, from inside the viewer', () => {
  const element = document.createElement('div');
  element.innerHTML = '<button type="button">Fillet</button><input aria-label="Width value" />';
  document.body.append(element);
  const startRename = vi.fn();
  const lookNormalTo = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) =>
    <ViewerElementContext.Provider value={{ current: element }}>{children}</ViewerElementContext.Provider>;
  renderHook(() => useEditShortcuts({ canUndo: false, canRedo: false, selected: 'block.py:7', startRename, lookNormalTo } as never, true), { wrapper });
  const button = element.querySelector('button')!;
  press(button, { key: 'F2' });
  expect(startRename).toHaveBeenCalledWith('block.py:7');
  press(button, { key: '8', metaKey: true });
  expect(lookNormalTo).toHaveBeenCalledTimes(1);
  // A text field keeps its keys.
  press(element.querySelector('input')!, { key: 'F2' });
  press(element.querySelector('input')!, { key: '8', ctrlKey: true });
  expect(startRename).toHaveBeenCalledTimes(1);
  expect(lookNormalTo).toHaveBeenCalledTimes(1);
});
