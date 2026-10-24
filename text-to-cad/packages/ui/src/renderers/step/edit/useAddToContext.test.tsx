import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import QuickEdit from '../../../../dist/renderers/kit/tools/quick-edit/QuickEdit.js';
import { ViewerHostContext } from '../../../../dist/host/context.js';
import { testHost } from '../../../../dist/host/testing/host.js';
import { featureTree } from '../../../../dist/renderers/step/edit/editMode.js';
import { featureAsk } from '../../../../dist/renderers/step/edit/featureAsk.js';
import { featurePick, pickedReferences } from '../../../../dist/renderers/step/edit/selectionBar.js';
import { useAddToContext } from '../../../../dist/renderers/step/edit/useAddToContext.js';

afterEach(cleanup);

const STEP = { kind: 'workspace-file', path: '/work/bracket/bracket.step', revision: 'r1' } as const;
const pick = (...selectors: string[]) => ({ resource: STEP, target: { kind: 'cad-selector', selectors } }) as const;
const FACE = pick('o1.f12');
const EDGE = pick('o1.e3');
const composer = { kind: 'composer', available: true };
const parts = (context: any) => context.parts.map((part: any) => [part.id, part.kind]);

/** The host's chat box: the context delivered to it is kept, and the host answers when the test says so. */
function chatBox(destination: object = composer) {
  const waiting: Array<{ resolve: (receipt: unknown) => void; reject: (error: unknown) => void }> = [];
  const deliver = vi.fn((_context: unknown) => new Promise((resolve, reject) => { waiting.push({ resolve, reject }); }));
  const host = testHost({ promptContext: { getSnapshot: () => destination, subscribe: () => () => {}, deliver } as never });
  return {
    host, deliver,
    answer: (receipt: unknown) => act(async () => { waiting.shift()!.resolve(receipt); }),
    refuse: (error: unknown) => act(async () => { waiting.shift()!.reject(error); }),
    delivered: () => deliver.mock.calls.map(call => call[0] as any),
  };
}

type Input = Partial<Parameters<typeof useAddToContext>[0]>;
function adding(host: ReturnType<typeof testHost>, input: Input = {}) {
  const onAdded = vi.fn(), onFailed = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => <ViewerHostContext.Provider value={host}>{children}</ViewerHostContext.Provider>;
  const view = renderHook((next: Input) => useAddToContext({ resource: STEP, references: [FACE], prompt: null, onAdded, onFailed, ...next } as never),
    { wrapper, initialProps: input });
  return { ...view, onAdded, onFailed };
}

it('puts the picks in the chat box with no note, inside the press, and lets go of them once they are there', async () => {
  const chat = chatBox();
  const view = adding(chat.host, { references: [FACE, EDGE] });
  act(() => view.result.current.add());
  // Handed to the host within the press, so it binds its destination in the gesture; nothing has been let go of yet.
  expect(chat.deliver).toHaveBeenCalledTimes(1);
  expect(parts(chat.delivered()[0])).toEqual([['file', 'reference'], ['reference-0', 'reference'], ['reference-1', 'reference']]);
  expect(view.onAdded).not.toHaveBeenCalled();
  await chat.answer({ status: 'added', partIds: [] });
  expect(view.onAdded).toHaveBeenCalledTimes(1);
  expect(view.onFailed).not.toHaveBeenCalled();
});

it('keeps the picks and says why when the chat box does not take them, in the words Quick Edit uses', async () => {
  const chat = chatBox();
  const view = adding(chat.host);
  act(() => view.result.current.add());
  await chat.answer({ status: 'failed', message: 'Wait for the last message to reach the chat.' });
  expect(view.onFailed).toHaveBeenLastCalledWith('Wait for the last message to reach the chat.');
  act(() => view.result.current.add());
  await chat.answer({ status: 'cancelled' });
  expect(view.onFailed).toHaveBeenLastCalledWith('The prompt did not go.');
  act(() => view.result.current.add());
  await chat.refuse(new Error("This app's chat doesn't take added context yet."));
  expect(view.onFailed).toHaveBeenLastCalledWith("This app's chat doesn't take added context yet.");
  expect(view.onFailed).toHaveBeenCalledTimes(3);
  expect(view.onAdded).not.toHaveBeenCalled();
});

it('says why when the chat box is gone before the press reaches it', async () => {
  const view = adding(testHost({ promptContext: { getSnapshot: () => composer, subscribe: () => () => {},
    deliver: () => { throw new Error('The chat is gone.'); } } as never }));
  act(() => view.result.current.add());
  await waitFor(() => expect(view.onFailed).toHaveBeenCalledWith('The chat is gone.'));
  expect(view.onAdded).not.toHaveBeenCalled();
});

it('takes one press at a time, and the next starts fresh once the last has settled', async () => {
  const chat = chatBox();
  const view = adding(chat.host);
  act(() => { view.result.current.add(); view.result.current.add(); });
  expect(chat.deliver).toHaveBeenCalledTimes(1);
  await chat.answer({ status: 'added', partIds: [] });
  act(() => view.result.current.add());
  expect(chat.deliver).toHaveBeenCalledTimes(2);
  await chat.refuse(new Error('Offline.'));
  act(() => view.result.current.add());
  expect(chat.deliver).toHaveBeenCalledTimes(3);
});

it('waits while a command is open, whose picks are the selection, and takes the press after it has closed', () => {
  const chat = chatBox();
  const view = adding(chat.host, { held: true });
  // What is picked is still the picks, and the chat box is still there: the toolbar is the one to say it waits.
  expect([view.result.current.offered, view.result.current.picked]).toEqual([true, true]);
  act(() => view.result.current.add());
  expect(chat.deliver).not.toHaveBeenCalled();
  expect([view.onAdded, view.onFailed].map(callback => callback.mock.calls.length)).toEqual([0, 0]);
  view.rerender({ held: false });
  act(() => view.result.current.add());
  expect(chat.deliver).toHaveBeenCalledTimes(1);
});

it("keeps the picks of a command that opens while the chat box is still answering, and still says if it refuses", async () => {
  const chat = chatBox();
  const view = adding(chat.host);
  act(() => view.result.current.add());
  view.rerender({ held: true });
  await chat.answer({ status: 'added', partIds: [] });
  // The context is in the chat box, but the selection is the command's now: it is not let go of.
  expect([view.onAdded, view.onFailed].map(callback => callback.mock.calls.length)).toEqual([0, 0]);
  // The press is spent: the next, once the command has closed, is taken, and a refusal is said whether or not a command is open.
  view.rerender({ held: false });
  act(() => view.result.current.add());
  expect(chat.deliver).toHaveBeenCalledTimes(2);
  view.rerender({ held: true });
  await chat.answer({ status: 'failed', message: 'Wait for the last message to reach the chat.' });
  expect(view.onFailed).toHaveBeenCalledWith('Wait for the last message to reach the chat.');
  expect(view.onAdded).not.toHaveBeenCalled();
});

it('has nothing to add with nothing picked: a file alone is no pick', () => {
  const chat = chatBox();
  const view = adding(chat.host, { references: [] });
  expect(view.result.current.picked).toBe(false);
  act(() => view.result.current.add());
  view.rerender({ references: [{ resource: STEP, target: { kind: 'whole-resource' } }] as never });
  expect(view.result.current.picked).toBe(false);
  act(() => view.result.current.add());
  expect(chat.deliver).not.toHaveBeenCalled();
  view.rerender({ references: [FACE] as never });
  expect(view.result.current.picked).toBe(true);
});

it('is offered only where the host has a chat box to fill', () => {
  const offered = (destination: object) => adding(chatBox(destination).host).result.current.offered;
  expect(offered(composer)).toBe(true);
  // Jake's standalone viewer copies to the clipboard: there is no chat box, so nothing offers it.
  expect(offered({ kind: 'clipboard', available: true })).toBe(false);
  expect(offered({ kind: 'composer', available: false, reason: 'No chat is open.' })).toBe(false);
  expect(offered({ kind: 'unavailable', available: false, reason: 'Prompt delivery is unavailable in this host.' })).toBe(false);
});

it('attaches the views and files a Queue would, and none where it would attach none', async () => {
  const chat = chatBox();
  const files = vi.fn((_views: unknown) => Promise.resolve({ inline: '{"jobs":[{"label":"current view"}]}' }));
  const prompt = { views: () => [{ label: 'current view' }], files, read: async () => new Blob([]) };
  const view = adding(chat.host, { prompt: prompt as never });
  act(() => view.result.current.add());
  expect(files).toHaveBeenCalledWith([{ label: 'current view' }]);
  const snapshot = chat.delivered()[0].parts.find((part: any) => part.kind === 'attachment');
  expect([snapshot.name, snapshot.about]).toEqual(['bracket.snapshot.json', ['file']]);
  await chat.answer({ status: 'added', partIds: [] });
  // A host that makes no files has no snapshot to attach: no picture is made up.
  view.rerender({ prompt: { views: () => [{ label: 'current view' }], files: () => null, read: null } as never });
  act(() => view.result.current.add());
  expect(chat.delivered()[1].parts.some((part: any) => part.kind === 'attachment')).toBe(false);
});

// Ask on a feature, and the references both carry.
const sketched = (name: string, line: number) => ({ name, plane: 'Top', file: 'bracket.py', line, status: 'Fully defined' });
const command = { command: 'extrude', values: {}, keeps: '' };
const STATE = {
  units: 'mm', name: 'bracket', root: '/work/bracket', script: '/work/bracket/bracket.py', files: { 'bracket.py': 'ab12' },
  features: [
    { key: 'e1', kind: 'Boss-Extrude', name: 'plate', file: 'bracket.py', line: 8, edit: command, sketch: sketched('SKETCH_000', 5) },
    { key: 'h1', kind: 'Hole', name: 'plate', file: 'bracket.py', line: 17 },
  ],
};
const TREE = featureTree(STATE);
const HOLE = featureAsk({ state: STATE, tree: TREE, pick: featurePick(TREE, 'h1'), onRemove: vi.fn() } as never)!;

it('carries exactly what Ask carries: a face and a chosen feature, the references Quick Edit would send', async () => {
  const carried = pickedReferences({ selectionActionVisible: true, selection: [FACE] as never, selectionChips: [], feature: HOLE });
  // Add to context.
  const chat = chatBox();
  const view = adding(chat.host, { references: carried.references as never });
  act(() => view.result.current.add());
  const added = chat.delivered()[0];
  expect(parts(added)).toEqual([['file', 'reference'], ['reference-0', 'reference'], ['reference-1', 'reference']]);
  expect(added.parts[2].reference).toMatchObject({ resource: { path: '/work/bracket/bracket.py' }, label: 'Hole (3)', target: { kind: 'text-range' } });
  // Ask, then Send.
  const send = vi.fn(async () => ({ status: 'sent' as const, partIds: [] }));
  const askHost = testHost({ promptContext: { getSnapshot: () => composer, subscribe: () => () => {}, deliver: vi.fn(), send } as never });
  render(<ViewerHostContext.Provider value={askHost}><div data-slot="cad-file-view">
    <QuickEdit resource={STEP} asked references={carried.references as never} chips={carried.chips as never} />
  </div></ViewerHostContext.Provider>);
  const note = screen.getByRole('textbox', { name: 'Describe your changes' });
  note.textContent = 'Make it 3.4 mm.';
  fireEvent.input(note);
  fireEvent.click(within(screen.getByRole('region', { name: 'Quick Edit' })).getByRole('button', { name: 'Send' }));
  await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  const asked = (send.mock.calls[0] as unknown[])[0] as any;
  const references = (context: any) => context.parts.filter((part: any) => part.kind === 'reference').map((part: any) => part.reference);
  expect(references(added)).toEqual(references(asked));
});
