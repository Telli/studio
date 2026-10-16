import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ViewerHostContext } from '../../../host/context.js';
import { testHost } from '../../../host/testing/host.js';
import { useEditMode } from './useEditMode.js';

afterEach(cleanup);

const FILE = '/project/parts/plate.step';
const RESOURCE = { kind: 'workspace-file', path: FILE };
const read = (width: string) => ({
  ok: true, units: 'mm', files: { 'sizes.py': width },
  params: [{ id: 'sizes.py:2:8', name: 'WIDTH', text: width, value: Number(width), unit: 'mm', file: 'sizes.py', line: 2 }],
  rows: [{ key: 'r1', name: 'plate', kind: 'Box', inputs: [] }],
  dimensions: [{ id: '0:x', name: 'Length', label: width, display: width, formula: 'WIDTH', leaves: ['sizes.py:2:8'], row: 'r1', anchor: [0, 0, 0], lines: [] }],
  building: { scripts: [], done: 0, error: null },
});

/** A viewer server that keeps one number, WIDTH, in a part's sizes, and every call it is asked. */
function server() {
  let width = '20';
  const changes: object[] = [];
  const client = {
    editState: vi.fn(async () => read(width)),
    editChange: vi.fn(async (change: { literal?: string; text: string }) => {
      changes.push(change);
      const from = width;
      width = change.text;
      return { ...read(width), change: { literal: 'sizes.py:2:8', name: 'WIDTH', file: 'sizes.py', line: 2, from, to: width } };
    }),
  };
  return { client, changes, width: () => width };
}

function hostWith(deliver: (context: unknown) => unknown) {
  const host = testHost({ promptContext: { getSnapshot: () => ({ kind: 'composer', available: true }), subscribe: () => () => {}, deliver } as never });
  return ({ children }: { children: ReactNode }) => <ViewerHostContext.Provider value={host}>{children}</ViewerHostContext.Provider>;
}

it('a part reads as its sizes and history, a change applies at once and the agent hears of it with the next message, and Undo puts the number back', async () => {
  const viewer = server();
  const notes: unknown[] = [];
  const { result } = renderHook(() => useEditMode({ client: viewer.client, file: FILE, resource: RESOURCE, active: true }),
    { wrapper: hostWith(context => { notes.push(context); return Promise.resolve({ status: 'added', partIds: [] }); }) });
  expect(result.current.status).toBe('reading');
  await act(async () => {});
  expect(result.current.status).toBe('ready');
  expect(result.current.selected).toBe('r1');
  expect(viewer.client.editState).toHaveBeenCalledWith(FILE, null);

  await act(async () => { await result.current.change({ literal: 'sizes.py:2:8', text: '25' }); });
  expect(viewer.width()).toBe('25');
  expect(viewer.changes.at(-1)).toMatchObject({ file: FILE, literal: 'sizes.py:2:8', text: '25', files: { 'sizes.py': '20' } });
  // Queued for the person's next message, never sent: the agent does not start work because of it.
  expect(JSON.stringify(notes)).toContain('In edit mode I changed Width (WIDTH) from 20 to 25 (sizes.py, line 2).');
  expect(result.current.canUndo).toBe(true);

  await act(async () => { await result.current.undo(); });
  expect(viewer.width()).toBe('20');
  expect(viewer.changes.at(-1)).toMatchObject({ literal: 'sizes.py:2:8', text: '20' });
  expect(result.current.canUndo).toBe(false);
  expect(result.current.canRedo).toBe(true);
});

it('a model with no part script beside it is not edited, and the view stays as it was', async () => {
  const client = { editState: vi.fn(async () => ({ ok: false, reason: 'no-script' })), editChange: vi.fn() };
  const { result } = renderHook(() => useEditMode({ client, file: '/project/imported.step', resource: RESOURCE, active: true }),
    { wrapper: hostWith(() => Promise.resolve()) });
  await act(async () => {});
  expect(result.current.status).toBe('none');
});

it('a client without edit mode has nothing to edit', () => {
  const { result } = renderHook(() => useEditMode({ client: {}, file: FILE, resource: RESOURCE, active: true }),
    { wrapper: hostWith(() => Promise.resolve()) });
  expect(result.current.status).toBe('none');
});

it('a command writes its line, the new feature is selected and its panel shut, the agent hears of it, and Undo takes the line back', async () => {
  const base = { ok: true, units: 'mm', files: { 'block.py': 'h1' }, params: [], dimensions: [], building: { scripts: [], done: 0, error: null },
    rows: [{ key: 'block.py:6', name: 'part', kind: 'Box', inputs: [] }] };
  const undo = { file: 'block.py', hunks: [{ start: 6, old: ['    part = fillet(...)\n'], new: [] }] };
  const filleted = { ...base, files: { 'block.py': 'h2' },
    rows: [...base.rows, { key: 'block.py:7', name: 'part', kind: 'Fillet', inputs: [] }],
    change: { kind: 'command', command: 'fillet', feature: 'Fillet', what: '4 edges', inputs: [{ label: 'Radius', display: '1', unit: 'mm' }],
      file: 'block.py', line: 7, row: 'block.py:7', undo, redo: { file: 'block.py', hunks: [] } } };
  const client = {
    editState: vi.fn(async () => base),
    editChange: vi.fn(async (request: { command?: object; splice?: object }) => (request.command ? filleted
      : { ...base, change: { kind: 'splice', file: 'block.py', line: 7 } })),
  };
  const notes: unknown[] = [];
  const { result } = renderHook(() => useEditMode({ client, file: FILE, resource: RESOURCE, active: true }),
    { wrapper: hostWith(context => { notes.push(context); return Promise.resolve({ status: 'added', partIds: [] }); }) });
  await act(async () => {});
  act(() => result.current.open('fillet'));
  expect(result.current.command).toBe('fillet');

  const request = { command: 'fillet', selection: [{ selector: 'e3' }], inputs: { radius: '1' } };
  await act(async () => { await result.current.run(request); });
  expect(client.editChange).toHaveBeenLastCalledWith({ command: request, file: FILE, files: { 'block.py': 'h1' } });
  expect(result.current.selected).toBe('block.py:7');
  expect(result.current.command).toBe(null);
  expect(JSON.stringify(notes)).toContain('In edit mode I added Fillet1, radius 1 mm, 4 edges (block.py, line 7).');

  await act(async () => { await result.current.undo(); });
  expect(client.editChange).toHaveBeenLastCalledWith({ splice: undo, file: FILE, files: { 'block.py': 'h2' } });
  expect(JSON.stringify(notes)).toContain('In edit mode I removed Fillet1 (block.py, line 7).');
  expect(result.current.canRedo).toBe(true);
});
