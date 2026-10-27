import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
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
    // A probe asks only whether there is a part script to edit.
    editState: vi.fn(async (_file: string, _files: unknown, options?: { probe?: boolean }) => (options?.probe ? { ok: true, editable: true } : read(width))),
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
  // Until the server says the file has a part script, the view is not laid out for editing.
  expect(result.current.status).toBe('probing');
  await act(async () => {});
  expect(result.current.status).toBe('ready');
  // As a CAD tool opens a part: nothing selected until the person picks a feature.
  expect(result.current.selected).toBe(null);
  expect(viewer.client.editState).toHaveBeenCalledWith(FILE, null, { probe: true });
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

it('a read that finds the part as it was takes who made its features as it is now', async () => {
  vi.useFakeTimers();
  try {
    const viewer = server();
    const { result } = renderHook(() => useEditMode({ client: viewer.client, file: FILE, resource: RESOURCE, active: true }),
      { wrapper: hostWith(() => Promise.resolve()) });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(result.current.status).toBe('ready');
    const read = result.current.state;
    // A turn of the agent's ended: the part reads as it did, and the feature the turn made is marked.
    viewer.client.editState.mockResolvedValueOnce({ ok: true, unchanged: true, building: read.building, authors: { r1: 'agent' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(viewer.client.editState).toHaveBeenLastCalledWith(FILE, read.files);
    expect(result.current.state.authors).toEqual({ r1: 'agent' });
    expect(result.current.state.rows).toBe(read.rows);
  } finally {
    vi.useRealTimers();
  }
});

it("a part whose script stops says where it stopped, for as long as that error stands", async () => {
  const stoppedAt = { frames: [{ file: 'plate.py', line: 9, text: 'plate = fillet(plate.edges(), radius=WALL)' }] };
  const trace = 'Traceback (most recent call last):\n  File "/project/parts/plate.py", line 9, in plate\nValueError: Failed creating a fillet';
  const refusal = 'That number is no longer in the source. Look again.';
  const viewer = server();
  // The first read stops; a change is then refused in words; another change makes the script stop again.
  viewer.client.editState.mockImplementation(async (_file: string, _files: unknown, options?: { probe?: boolean }) => (
    options?.probe ? { ok: true, editable: true } : { ok: false, error: trace, failure: stoppedAt }));
  viewer.client.editChange.mockResolvedValueOnce({ ok: false, error: refusal });
  const { result } = renderHook(() => useEditMode({ client: viewer.client, file: FILE, resource: RESOURCE, active: true }),
    { wrapper: hostWith(() => Promise.resolve()) });
  await act(async () => {});
  expect(result.current.error).toBe(trace);
  expect(result.current.failure).toEqual(stoppedAt);

  // A refusal in words is another error: the place was the one before's.
  await act(async () => { await result.current.change({ literal: 'sizes.py:2:8', text: '5' }); });
  expect(result.current.error).toBe(refusal);
  expect(result.current.failure).toBe(null);

  // A change that makes the script stop says where, too, and dismissing the error takes the place with it.
  viewer.client.editChange.mockResolvedValueOnce({ ok: false, error: trace, failure: stoppedAt });
  await act(async () => { await result.current.change({ literal: 'sizes.py:2:8', text: '5000' }); });
  expect(result.current.failure).toEqual(stoppedAt);
  act(() => result.current.dismissError());
  expect(result.current.error).toBe('');
  expect(result.current.failure).toBe(null);
});

it('laid out for the AI, the part is read once and quietly, so Edit by hand opens on it at once', async () => {
  const viewer = server();
  const { result, rerender } = renderHook(({ reading }) => useEditMode({ client: viewer.client, file: FILE, resource: RESOURCE, active: true, reading }),
    { wrapper: hostWith(() => Promise.resolve()), initialProps: { reading: false } });
  await act(async () => {});
  expect(result.current.status).toBe('ready');
  expect(viewer.client.editState).toHaveBeenCalledWith(FILE, null);
  // Nothing more is asked while the AI layout is up: the part is not run again and again.
  const asked = viewer.client.editState.mock.calls.length;
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 1700)); });
  expect(viewer.client.editState).toHaveBeenCalledTimes(asked);
  // Edit by hand finds it read, and its first read asks only whether the files changed.
  rerender({ reading: true });
  expect(result.current.status).toBe('ready');
  await act(async () => {});
  expect(viewer.client.editState).toHaveBeenLastCalledWith(FILE, { 'sizes.py': '20' });
});

it('a switch to Edit by hand while the quiet read is out waits for that read, not for another', async () => {
  const viewer = server();
  let answer: (value: unknown) => void = () => {};
  viewer.client.editState.mockImplementation(async (_file: string, _files: unknown, options?: { probe?: boolean }) =>
    (options?.probe ? { ok: true, editable: true } : new Promise(resolve => { answer = resolve; })));
  const { result, rerender } = renderHook(({ reading }) => useEditMode({ client: viewer.client, file: FILE, resource: RESOURCE, active: true, reading }),
    { wrapper: hostWith(() => Promise.resolve()), initialProps: { reading: false } });
  await act(async () => {});
  expect(result.current.status).toBe('idle');
  rerender({ reading: true });
  await act(async () => {});
  expect(result.current.status).toBe('reading');
  // One read of the part, shared by both layouts.
  expect(viewer.client.editState.mock.calls.filter(call => call[1] === null && call.length === 2)).toHaveLength(1);
  await act(async () => { answer(read('20')); });
  expect(result.current.status).toBe('ready');
});

it('a model with no part script beside it is not edited, and the view stays as it was', async () => {
  const client = { editState: vi.fn(async () => ({ ok: true, editable: false })), editChange: vi.fn() };
  const { result } = renderHook(() => useEditMode({ client, file: '/project/imported.step', resource: RESOURCE, active: true }),
    { wrapper: hostWith(() => Promise.resolve()) });
  await act(async () => {});
  expect(result.current.status).toBe('none');
  // The part is never run to find out.
  expect(client.editState).toHaveBeenCalledTimes(1);
});

it('a server without edit mode leaves the view as it was', async () => {
  const client = { editState: vi.fn(async () => { throw new Error('404'); }), editChange: vi.fn() };
  const { result } = renderHook(() => useEditMode({ client, file: FILE, resource: RESOURCE, active: true }),
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
    editState: vi.fn(async (_file: string, _files: unknown, options?: { probe?: boolean }) => (options?.probe ? { ok: true, editable: true } : base)),
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

it('a preview is made without writing anything, one at a time, the newest asked the one shown, and none once the panel shuts', async () => {
  const viewer = server();
  const asked: Array<{ preview?: object }> = [];
  const answers: Array<(reply: object) => void> = [];
  viewer.client.editChange.mockImplementation((change: { preview?: object }) => {
    asked.push(change);
    return new Promise(resolve => answers.push(resolve));
  });
  const { result } = renderHook(() => useEditMode({ client: viewer.client, file: FILE, resource: RESOURCE, active: true }),
    { wrapper: hostWith(() => Promise.resolve({ status: 'added', partIds: [] })) });
  await act(async () => {});
  act(() => result.current.open('fillet'));
  const first = { command: 'fillet', selection: [{ selector: 'e1' }], inputs: { radius: '1' } };
  const second = { ...first, inputs: { radius: '2' } };
  act(() => result.current.previewFeature(first));
  expect(result.current.featurePreview).toMatchObject({ status: 'updating' });
  // Asked again while the first is made: the second waits for it, and the first's answer is not shown.
  act(() => result.current.previewFeature(second));
  expect(asked).toEqual([{ preview: first, file: FILE, files: { 'sizes.py': '20' } }]);
  await act(async () => { answers[0]({ ok: true, preview: { removed: { positions: [], triangles: [], edges: [] }, added: null, error: null } }); });
  await waitFor(() => expect(asked).toHaveLength(2));
  expect(asked[1]).toEqual({ preview: second, file: FILE, files: { 'sizes.py': '20' } });
  expect(result.current.featurePreview).toMatchObject({ status: 'updating' });
  await act(async () => { answers[1]({ ok: true, preview: { error: 'Try a smaller radius.' } }); });
  await waitFor(() => expect(result.current.featurePreview).toMatchObject({ status: 'failed', error: 'Try a smaller radius.', removed: null }));
  // The same again is not asked again; the panel shut, none is shown. Nothing was written.
  act(() => result.current.previewFeature(second));
  expect(asked).toHaveLength(2);
  act(() => result.current.close());
  expect(result.current.featurePreview).toBe(null);
  expect(viewer.width()).toBe('20');
});

it("the drawing's sheet opens in the view, a change made on it is drawn again and told, Undo and Redo walk its own history, and a stale sheet is drawn again", async () => {
  const viewer = server();
  const sheetAsks: { sheet: { index: number; hash?: string; edit?: { kind: string; hunks?: unknown[]; undo?: boolean } } }[] = [];
  let script = 1;
  let stale = false;
  const drawn = () => ({ schemaVersion: 3, primitives: [], entities: [], fonts: [], bounds: [0, 0, 420, 297], hash: `h${script}`,
    file: 'plate_drawing.py', sheet: { index: 1, count: 1, size: 'A3', views: [], sources: {}, frame: [10, 410, 10, 287], units: 'mm' } });
  const editChange = viewer.client.editChange;
  viewer.client.editChange = vi.fn(async (change: never) => {
    const asked = change as { sheet?: (typeof sheetAsks)[number]['sheet'] };
    if (!asked.sheet) return editChange(change);
    sheetAsks.push({ sheet: asked.sheet });
    if (asked.sheet.edit && stale) { stale = false; script += 1; return { ok: false, stale: true, error: 'The drawing\'s script changed since the sheet was drawn. Here it is as it is now.' }; }
    if (!asked.sheet.edit) return { ok: true, drawingOnly: true, drawing: { script: 'plate_drawing.py' }, sheet: drawn() };
    script += 1;
    return { ok: true, drawingOnly: true, drawing: { script: 'plate_drawing.py' }, sheet: drawn(),
      sheetEdit: { undo: [{ start: 9, old: [`b${script}`], new: [`a${script}`] }], redo: [{ start: 9, old: [`a${script}`], new: [`b${script}`] }] },
      change: { kind: 'drawing', file: 'plate_drawing.py', line: 9, words: asked.sheet.edit.kind === 'splice' ? 'took back a change to its sheet' : 'moved its top, front and right views 10 mm right', pdf: 'plate_drawing.pdf', build: false } };
  }) as never;
  const notes: unknown[] = [];
  const { result } = renderHook(() => useEditMode({ client: viewer.client, file: FILE, resource: RESOURCE, active: true }),
    { wrapper: hostWith(context => { notes.push(context); return Promise.resolve({ status: 'added', partIds: [] }); }) });
  await act(async () => {});
  await act(async () => { await result.current.openSheet(1); });
  expect(sheetAsks.at(-1)).toEqual({ sheet: { index: 1 } });
  expect(result.current.sheetView).toMatchObject({ index: 1, busy: false, error: '', undo: [], redo: [] });
  expect(result.current.sheetView?.payload.hash).toBe('h1');

  // A view dragged: asked on the sheet as it was drawn, then drawn again, and the agent told.
  await act(async () => { await result.current.sheetEdit({ kind: 'move', view: { end: [11, 62] }, by: [10, 0] }); });
  expect(sheetAsks.at(-1)).toEqual({ sheet: { index: 1, hash: 'h1', edit: { kind: 'move', view: { end: [11, 62] }, by: [10, 0] } } });
  expect(result.current.sheetView?.payload.hash).toBe('h2');
  expect(result.current.sheetView?.undo).toHaveLength(1);
  expect(JSON.stringify(notes)).toContain('In edit mode I moved its top, front and right views 10 mm right (plate_drawing.py); it wrote plate_drawing.pdf.');
  // The part's own history is not the sheet's.
  expect(result.current.canUndo).toBe(false);

  // Undo sends the change's hunks back; Redo sends them again.
  await act(async () => { await result.current.undoSheet(); });
  expect(sheetAsks.at(-1)?.sheet.edit).toEqual({ kind: 'splice', hunks: [{ start: 9, old: ['b2'], new: ['a2'] }], undo: true });
  expect([result.current.sheetView?.undo.length, result.current.sheetView?.redo.length]).toEqual([0, 1]);
  await act(async () => { await result.current.redoSheet(); });
  expect(sheetAsks.at(-1)?.sheet.edit).toEqual({ kind: 'splice', hunks: [{ start: 9, old: ['a2'], new: ['b2'] }] });
  expect([result.current.sheetView?.undo.length, result.current.sheetView?.redo.length]).toEqual([1, 0]);

  // The agent changed the drawing's script since: the change is refused, and the sheet drawn as it is.
  stale = true;
  await act(async () => { await result.current.sheetEdit({ kind: 'delete', end: [12, 17] }); });
  expect(sheetAsks.at(-1)).toEqual({ sheet: { index: 1 } });
  expect(result.current.sheetView).toMatchObject({ undo: [], redo: [], error: "The drawing's script changed since the sheet was drawn. Here it is as it is now." });

  // A command opened puts the sheet away.
  act(() => { result.current.open('fillet'); });
  expect(result.current.sheetView).toBe(null);
});

it('S asks the toolbar for its command search by counting, so each ask is heard once and an old one is not heard again', async () => {
  const viewer = server();
  const { result } = renderHook(() => useEditMode({ client: viewer.client, file: FILE, resource: RESOURCE, active: true }),
    { wrapper: hostWith(() => Promise.resolve()) });
  await act(async () => {});
  expect(result.current.findAsked).toBe(0);
  act(() => result.current.findCommand());
  expect(result.current.findAsked).toBe(1);
  act(() => result.current.findCommand());
  expect(result.current.findAsked).toBe(2);
});

it("a STEP brought in with no part script is offered as a part to edit, made beside it, built, and named by its id to open", async () => {
  const imported = '/project/vendor/pico.step';
  const PART = '3f2a9c1e-7b4d-5e6f-8a9b-0c1d2e3f4a5b';
  // The engine holds the part only once its build is done: the probe says it is building, then built.
  const probes = [{ ok: true, editable: false, importable: true }, { ok: true, editable: false, importable: true, part: PART, partBuilt: false, partBuilding: true },
    { ok: true, editable: false, importable: true, part: PART, partBuilt: true, partBuilding: false }];
  const client = {
    editState: vi.fn(async () => probes.shift() || probes.at(-1)),
    editChange: vi.fn(async () => ({ ok: true, part: PART, script: '/project/vendor/pico_part.py' })),
  };
  const { result } = renderHook(() => useEditMode({ client, file: imported, active: true }), { wrapper: hostWith(() => {}) });
  await waitFor(() => expect(result.current.status).toBe('none'));
  expect(result.current.imported).toEqual({ part: null });
  vi.useFakeTimers({ toFake: ['setTimeout'] });
  try {
    let made: unknown = 'waiting';
    const adopting = result.current.adopt().then(reply => { made = reply; });
    await vi.advanceTimersByTimeAsync(0);
    // Not opened while it builds: an id never built is not built by opening it.
    expect(made).toBe('waiting');
    await vi.advanceTimersByTimeAsync(1000);
    await adopting;
    expect(client.editChange).toHaveBeenCalledWith({ file: imported, adopt: {} });
    expect(made).toMatchObject({ ok: true, part: PART });
  } finally {
    vi.useRealTimers();
  }
  // A build that ended without the part names none to open.
  probes.push({ ok: true, editable: false, importable: true, part: PART, partBuilt: false, partBuilding: false });
  await expect(result.current.importedPart()).resolves.toBe(null);
});
