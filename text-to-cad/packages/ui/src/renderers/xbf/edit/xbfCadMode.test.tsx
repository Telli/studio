import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { ViewerHostContext } from '../../../../dist/host/context.js';
import { testHost } from '../../../../dist/host/testing/host.js';
import { editLayoutHost } from '../../../../dist/tab-store/editLayoutHost.js';
import { presentXbfTree } from '../../../../dist/renderers/xbf/xbfTree.js';
import { featureTree, selectionItems, selectionLabel } from '../../../../dist/renderers/xbf/edit/editMode.js';
import { faceChipName, faceNumber, faceReference } from '../../../../dist/renderers/xbf/edit/faceChips.js';
import { facePick } from '../../../../dist/renderers/xbf/edit/selectionBar.js';
import { elementOf, xbfEditReference } from '../../../../dist/renderers/xbf/edit/selectors.js';
import { useFaceFeatures } from '../../../../dist/renderers/xbf/edit/useFaceFeatures.js';
import { useXbfEditLayout } from '../../../../dist/renderers/xbf/edit/useXbfCadMode.js';

// CAD mode on an engine document: whether its layout mounts, and how a face picked on the model comes to name the feature
// that made it. The viewport is the browser's; these are its rules over what the edit service answers.

afterEach(() => { cleanup(); editLayoutHost.reportEditState(null); });

// A plate as the engine serves its document (one part, `plate`), and as the edit service reads its script: a base, then a
// hole through it, each a row of the design tree.
const DOCUMENT = '6f1c0d8e-2b7a-4c1e-9d3f-5a6b7c8d9e0f';
const STRUCTURE = {
  name: 'plate', version: '1-1', units: 'mm',
  prototypes: [{ index: 0, key: 'k-plate', name: 'plate', color: null, faceNames: {}, edgeNames: {}, faceColors: {} }],
  instances: [{ prototype: 0, path: 'plate', matrix: [], color: null }],
  tree: { name: 'plate', prototype: 0, instance: 0 },
};
const command = { command: 'extrude', values: {} };
const READ = {
  ok: true, units: 'mm', files: { 'plate.py': 'a1' }, document: DOCUMENT, faceCount: 7,
  features: [
    { key: 'plate.py:8', kind: 'Boss-Extrude', name: 'base', file: 'plate.py', line: 8, edit: command },
    { key: 'plate.py:11', kind: 'Hole', name: 'base', file: 'plate.py', line: 11, edit: { command: 'hole', values: {} } },
  ],
  faceFeatures: { '1': 'plate.py:8', '7': 'plate.py:8' },
  building: { scripts: [], done: 0, error: null },
};

/** The scene's face 12 of the plate (`i0/face/12`), flat, as the renderer describes it. */
const scene = {
  describeElement: (id: string) => (id === 'i0/face/12' ? { id, kind: 'face', ordinal: 12, instance: 0, key: 'k-plate', name: '', path: 'plate' } : null),
  elementGeometry: () => ({ kind: 'face', surface: { type: 'plane', normal: [0, 0, 1], origin: [5, 5, 4] } }),
};
const tree = presentXbfTree(STRUCTURE);
const FACTS = { kind: 'face', ordinal: 12, area: 12.5, centroid: [5, 5, 4], surface: 'plane', box: { min: [0, 0, 4], max: [10, 10, 4] } };

/** A viewer server that answers a probe for each document as `editable` says, and reads the plate. */
function server(editable: Record<string, object>) {
  return {
    editState: vi.fn(async (file: string, _files: unknown, options?: { probe?: boolean }) => (options?.probe ? editable[file] : READ)),
    editChange: vi.fn(async () => READ),
  };
}
const services = (layout = 'manual') => ({ preferences: { editLayout: layout }, onPreferenceChange: vi.fn() });
const host = testHost();
const wrapper = ({ children }: { children: ReactNode }) => <ViewerHostContext.Provider value={host}>{children}</ViewerHostContext.Provider>;

it('the edit layout mounts on a document whose part has a script CAD mode edits, and not on a plain STEP without one', async () => {
  const client = server({
    [DOCUMENT]: { ok: true, editable: true, document: DOCUMENT },
    '/work/bought/bracket.step': { ok: true, editable: false, importable: true, part: null },
  });
  const model = renderHook(() => useXbfEditLayout({ client, file: DOCUMENT, services: services(), active: true }), { wrapper });
  await waitFor(() => expect(model.result.current.edit.status).toBe('ready'));
  expect([model.result.current.editable, model.result.current.editing, model.result.current.cad]).toEqual([true, true, true]);
  // The host's switch hears it, as the view's own would.
  expect(editLayoutHost.editState()).toEqual({ editable: true, busy: false });
  model.unmount();
  expect(editLayoutHost.editState()).toEqual({ editable: false, busy: false });

  const step = renderHook(() => useXbfEditLayout({ client, file: '/work/bought/bracket.step', services: services(), active: true }), { wrapper });
  await waitFor(() => expect(step.result.current.edit.status).toBe('none'));
  expect([step.result.current.editable, step.result.current.editing, step.result.current.cad]).toEqual([false, false, false]);
  // Only asked whether there is a script: the STEP is never read as a part.
  expect(client.editState).not.toHaveBeenCalledWith('/work/bought/bracket.step', null);

  // Laid out for the AI, the document is editable and the workspace is not up.
  const asked = renderHook(() => useXbfEditLayout({ client, file: DOCUMENT, services: services('ai'), active: true }), { wrapper });
  await waitFor(() => expect(asked.result.current.edit.status).not.toBe('probing'));
  expect([asked.result.current.editable, asked.result.current.editing]).toEqual([true, false]);
});

it("a selector `part/face 12` round-trips through the pick, faceChips and the selection bar", () => {
  const reference = xbfEditReference({ scene, tree, id: 'i0/face/12', facts: FACTS })!;
  // The engine's ref by number, never its element name, with what the engine measured of it.
  expect(reference).toEqual({ id: 'i0/face/12', selectorType: 'face', displaySelector: 'plate/face 12', normalizedSelector: 'plate/face 12',
    pickData: { surfaceType: 'plane', center: [5, 5, 4], normal: [0, 0, 1], area: 12.5, bbox: { min: [0, 0, 4], max: [10, 10, 4] } } });
  expect(elementOf('plate/face 12')).toEqual({ kind: 'face', ordinal: 12, owner: 'plate', occurrence: null });
  expect(faceNumber(faceReference(reference.displaySelector))).toBe(12);
  // What a command is handed of it, and how its panel lists it.
  const [item] = selectionItems([reference]);
  expect(item).toEqual({ selector: 'plate/face 12', type: 'plane', center: [5, 5, 4], size: 12.5 });
  expect(selectionLabel(item)).toBe('Face 12');
  // Named by its feature, and the bar's Edit is that feature's.
  const faces = { faceFeatures: { '12': 'plate.py:11' } };
  const part = featureTree(READ);
  expect(faceChipName(faceReference(reference.displaySelector), faces, part.features)).toEqual({ name: 'Hole1', kind: 'face', number: '12' });
  expect(facePick(part, [{ kind: 'face', id: reference.id, reference }], faces)?.id).toBe('plate.py:11');
});

it('an edit-mode pick yields the feature row the engine says made it, asked with the files the page read; a stale answer names none', async () => {
  const answers: Record<number, object> = {
    12: { ok: true, faceFeature: { face: 12, feature: 'plate.py:11', component: null, source: 'made_by', madeBy: { line: 11 } } },
    3: { ok: true, faceFeature: { face: 3, feature: null, component: null, source: null, madeBy: null, stale: true } },
  };
  const client = { editFace: vi.fn(async ({ face }: { face: number }) => answers[face]) };
  const props = { client, file: DOCUMENT, shown: true, version: 'v1', files: READ.files, numbers: [12] };
  const { result, rerender } = renderHook((next: typeof props) => useFaceFeatures(next), { initialProps: props });
  await waitFor(() => expect(result.current.faces).toEqual({ faceFeatures: { '12': 'plate.py:11' } }));
  expect(client.editFace).toHaveBeenCalledWith({ file: DOCUMENT, face: 12, files: { 'plate.py': 'a1' } });
  // The pick is the Hole's row, as the design tree has it.
  const reference = xbfEditReference({ scene, tree, id: 'i0/face/12', facts: FACTS })!;
  const row = facePick(featureTree(READ), [{ kind: 'face', id: reference.id, reference }], result.current.faces);
  expect([row?.id, row?.feature.kind, row?.editable]).toEqual(['plate.py:11', 'Hole', true]);

  // A face of a part being built again names nothing, and is asked again once the part reads anew.
  rerender({ ...props, numbers: [12, 3] });
  await waitFor(() => expect(client.editFace).toHaveBeenCalledTimes(2));
  expect(result.current.faces).toEqual({ faceFeatures: { '12': 'plate.py:11' } });
  answers[3] = { ok: true, faceFeature: { face: 3, feature: 'plate.py:8', component: null, source: 'made_by', madeBy: { line: 8 } } };
  rerender({ ...props, numbers: [12, 3], version: 'v2' });
  await waitFor(() => expect(result.current.faces).toEqual({ faceFeatures: { '12': 'plate.py:11', '3': 'plate.py:8' } }));

  // Outside the workspace, nothing is asked or named.
  rerender({ ...props, numbers: [12, 3], version: 'v3', shown: false });
  expect(result.current.faces).toBe(null);
  const calls = client.editFace.mock.calls.length;
  await act(async () => {});
  expect(client.editFace.mock.calls.length).toBe(calls);
});
