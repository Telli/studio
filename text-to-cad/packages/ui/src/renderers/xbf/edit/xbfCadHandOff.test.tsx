import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadXbfDocument } from '@text-to-cad/core/lib/xbf/xbfDocument.js';
import { createXbfScene } from '@text-to-cad/core/lib/xbf/xbfScene.js';
import { ViewerHostContext } from '../../../../dist/host/context.js';
import { testHost } from '../../../../dist/host/testing/host.js';
import { editLayoutHost } from '../../../../dist/tab-store/editLayoutHost.js';
import { presentXbfTree } from '../../../../dist/renderers/xbf/xbfTree.js';
import { useXbfScene } from '../../../../dist/renderers/xbf/useXbfScene.js';
import { useXbfCadMode } from '../../../../dist/renderers/xbf/edit/useXbfCadMode.js';

// CAD mode's pieces that live on the renderer: what it draws over the xbf scene, the rollback bar's body opened in the part's
// place, and Studio's hand-off between the AI's layout and CAD's on a double-click. The viewport is the browser's; these are the
// rules over the edit service's answers and the host's.

const DOCUMENT = '6f1c0d8e-2b7a-4c1e-9d3f-5a6b7c8d9e0f';
const BAR = '0a1b2c3d-4e5f-5a6b-8c7d-9e0f1a2b3c4d';
const STRUCTURE = {
  name: 'plate', version: '1-1', units: 'mm',
  prototypes: [{ index: 0, key: 'k-plate', name: 'plate', color: null, faceNames: {}, edgeNames: {}, faceColors: {} }],
  instances: [{ prototype: 0, path: 'plate', matrix: [], color: null }],
  tree: { name: 'plate', prototype: 0, instance: 0 },
};
const tree = presentXbfTree(STRUCTURE);
// A sketch on the plate's top (z = 4), nothing using it yet: a line from (0, 0) to (40, 0).
const SKETCH = {
  file: 'plate.py', line: 5, name: 'Sketch1', consumed: null,
  state: { frame: { origin: [0, 0, 4], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, unit: 1,
    points: [{ id: 'P1', x: 0, y: 0 }, { id: 'P2', x: 40, y: 0 }], curves: [{ id: 'L1', kind: 'line', start: 'P1', end: 'P2', defined: true }] },
};
// The plate as the edit service reads its script: a base, then a hole through it; twelve faces, the trace crediting face 1 to
// the base and face 3 to the hole.
const PART = {
  ok: true, units: 'mm', files: { 'plate.py': 'a1' }, document: DOCUMENT, faceCount: 12, bounds: [[0, 0, 0], [40, 20, 4]],
  features: [
    { key: 'plate.py:8', kind: 'Boss-Extrude', name: 'base', file: 'plate.py', line: 8, edit: { command: 'extrude', values: {} } },
    { key: 'plate.py:11', kind: 'Hole', name: 'base', file: 'plate.py', line: 11, edit: { command: 'hole', values: {} } },
  ],
  faceFeatures: { '1': 'plate.py:8', '3': 'plate.py:11' },
  sketches: [SKETCH],
  building: { scripts: [], done: 0, error: null },
};
const scene = {
  describeElement: (id: string) => (id === 'i0/face/12' ? { id, kind: 'face', ordinal: 12, instance: 0, key: 'k-plate', name: '', path: 'plate' } : null),
  elementGeometry: () => ({ kind: 'face', surface: { type: 'plane', normal: [0, 0, 1], origin: [5, 5, 4] } }),
  faceCount: () => 12,
  selectionBounds: () => ({ min: [0, 0, 0], max: [1, 1, 1] }),
};
const FACE = { id: 'i0/face/12', kind: 'face', ordinal: 12 };

function server({ file = DOCUMENT } = {}) {
  return {
    editState: vi.fn(async (asked: string, _files: unknown, options?: { probe?: boolean }) => (options?.probe
      ? (asked === file && asked === DOCUMENT ? { ok: true, editable: true, document: DOCUMENT } : { ok: true, editable: false }) : PART)),
    editChange: vi.fn(async (change: { bar?: { item?: string } }) => (change.bar?.item
      ? { ...PART, bar: { before: change.bar.item, item: change.bar.item, name: 'Hole1', kind: 'part', document: { id: BAR, name: 'plate at the rollback bar 1a2b3c4d' } } }
      : PART)),
    // The engine says the hole made face 12.
    editFace: vi.fn(async ({ face }: { face: number }) => ({ ok: true, faceFeature: { face, feature: face === 12 ? 'plate.py:11' : null,
      component: null, source: 'made_by', madeBy: null } })),
    engineDocument: vi.fn(() => new Promise(() => {})),
  };
}
const host = testHost();
const wrapper = ({ children }: { children: ReactNode }) => <ViewerHostContext.Provider value={host}>{children}</ViewerHostContext.Provider>;
type Options = { layout?: string; file?: string; toolMode?: string; isolated?: boolean };
function props(client: ReturnType<typeof server>, { layout = 'manual', file = DOCUMENT, toolMode = 'select', isolated = false }: Options = {},
  extra: Record<string, unknown> = {}) {
  return { view: { file: { path: file }, appearance: {} }, document: { client, services: { preferences: { editLayout: layout }, onPreferenceChange: vi.fn() } },
    scene, tree, assembly: false, loading: false, updating: false, revision: 'r1', selectedElementIds: [], setChosen: vi.fn(), facts: new Map(),
    toolMode, previewing: false, ensureSelect: vi.fn(), setSelectFilter: vi.fn(), viewportRef: { current: null }, lookAt: vi.fn(), isolated, ...extra };
}
/** CAD mode over the renderer, re-rendered with other options as the tab's layout or the tool in hand changes. */
function mount(client: ReturnType<typeof server>, options: Options = {}) {
  const lookAt = vi.fn();
  const view = renderHook((next: Options) => useXbfCadMode(props(client, next, { lookAt }) as never), { wrapper, initialProps: options });
  return { ...view, lookAt };
}
/** A host that takes the ask for a layout, as Studio's does (`studio/request/edit-layout`): `answer` says how it answers. */
function studio(answer: (layout: string) => Promise<unknown> = async () => ({})) {
  editLayoutHost.set(true);
  const requester = vi.fn(answer);
  const release = editLayoutHost.setRequester(requester);
  return { requester, release };
}
let released: (() => void) | null = null;
afterEach(() => { cleanup(); released?.(); released = null; editLayoutHost.reportEditState(null); editLayoutHost.set(false); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('what CAD mode draws on the xbf scene', () => {
  let moves: number[][] = [];
  beforeEach(() => {
    moves = [];
    const ignore = () => {};
    const context = {
      canvas: { clientWidth: 800 }, save: ignore, restore: ignore, beginPath: ignore, lineTo: ignore, closePath: ignore, stroke: ignore, fill: ignore,
      arc: ignore, rect: ignore, roundRect: ignore, setTransform: ignore, clearRect: ignore, setLineDash: ignore, fillText: ignore,
      moveTo: (x: number, y: number) => { moves.push([x, y]); }, measureText: (text: string) => ({ width: text.length * 6 }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0));
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  });

  // The engine's document of a filleted plate and its pegs, as `cadgen serve` answers it (core's fixture).
  const FIXTURE = join(dirname(createRequire(import.meta.url).resolve('@text-to-cad/core/lib/xbf/xbfDocument.js')), '__fixtures__');
  async function xbfScene() {
    const structure = JSON.parse(readFileSync(join(FIXTURE, 'bracket', 'structure.json'), 'utf8'));
    const look = readFileSync(join(FIXTURE, 'look.json'), 'utf8');
    const base = 'http://127.0.0.1:9/api/doc/abc123';
    const fetch = async (url: string) => {
      if (url.endsWith('/api/look')) return new Response(look);
      // An environment image for the look: 1 x 1, radiance 1.
      if (url.endsWith('/api/look/environment')) {
        return new Response(new Uint8Array([...new TextEncoder().encode('#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 1 +X 1\n'), 255, 255, 255, 128]).buffer);
      }
      const rest = url.slice(base.length).replace(/\?tessellation=[^&]*$/, '');
      if (rest === '') return new Response(JSON.stringify(structure));
      const part = /^\/part\/([^/]+)$/.exec(rest);
      if (part) return new Response(readFileSync(join(FIXTURE, 'bracket', `${part[1]}.xbm`)));
      return new Response(JSON.stringify({ version: structure.version }));
    };
    return createXbfScene(THREE, await loadXbfDocument(base, { fetch }));
  }

  it("draws a sketch nothing uses yet over the xbf scene, in the part's millimetres through the model group the shell holds it in", async () => {
    const xbf = await xbfScene();
    // The shell's runtime as it adopts a scene: the xbf scene's object under the model group, moved by the model's offset.
    const modelGroup = new THREE.Group();
    modelGroup.position.set(5, -3, 2);
    modelGroup.add(xbf.object3D);
    modelGroup.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(45, 800 / 600, 1, 1000);
    camera.up.set(0, 0, 1);
    camera.position.set(60, -80, 60);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    camera.updateProjectionMatrix();
    const element = document.createElement('div');
    Object.defineProperty(element, 'clientWidth', { value: 800 });
    Object.defineProperty(element, 'clientHeight', { value: 600 });
    document.body.append(element);
    const viewport = { runtimeRef: { current: { THREE, camera, modelGroup } }, hostRef: { current: element }, viewerReadyTick: 1 };

    const client = server();
    function Overlay() {
      const cad = useXbfCadMode(props(client) as never);
      return cad.overlay(viewport);
    }
    render(<Overlay />, { wrapper });
    await waitFor(() => expect(moves.length).toBeGreaterThan(0));
    expect(document.querySelector('[data-cad-sketches]')).toBeTruthy();
    // The line's start, the sketch's origin on the plate's top, lands where the model group puts that point on screen.
    const at = new THREE.Vector3(0, 0, 4).applyMatrix4(modelGroup.matrixWorld).project(camera);
    const [x, y] = moves[0];
    expect(x).toBeCloseTo(((at.x + 1) * 800) / 2, 6);
    expect(y).toBeCloseTo(((1 - at.y) * 600) / 2, 6);
    xbf.dispose();
  });
});

describe('the rollback bar', () => {
  it("is opened by its body's id in the part's place while the bar is up, and its faces name no feature", async () => {
    const client = server();
    // As the renderer reads it: the document on screen is the bar's body while CAD mode has the bar up, else the part.
    const view = renderHook(() => {
      const cad = useXbfCadMode(props(client) as never);
      useXbfScene({ client, file: cad.rollback || DOCUMENT });
      return cad;
    }, { wrapper });
    await waitFor(() => expect(view.result.current.faces).not.toBe(null));
    expect(client.engineDocument.mock.calls.map(call => call[0])).toEqual([DOCUMENT]);
    await act(async () => { await view.result.current.edit.rollTo('plate.py:11'); });
    expect(view.result.current.rollback).toBe(BAR);
    await waitFor(() => expect(client.engineDocument.mock.calls.map(call => call[0])).toEqual([DOCUMENT, BAR]));
    // Its faces are the body's, numbered apart from the part's: none is named by the part's features.
    expect(view.result.current.faces).toBe(null);
    // Rolled to the end, the part is shown again.
    await act(async () => { await view.result.current.edit.rollTo(null); });
    expect(view.result.current.rollback).toBe('');
    await waitFor(() => expect(client.engineDocument.mock.calls.map(call => call[0])).toEqual([DOCUMENT, BAR, DOCUMENT]));
  });
});

describe("Studio's hand-off on a double-click", () => {
  it("laid out for the AI, a face asks Studio for CAD, and once CAD has read the part that face's feature is selected", async () => {
    const { requester, release } = studio();
    released = release;
    const client = server();
    const { result, rerender, lookAt } = mount(client, { layout: 'ai' });
    await waitFor(() => expect(result.current.edit.status).toBe('ready'));
    expect(result.current.editing).toBe(false);
    let taken = false;
    act(() => { taken = result.current.doubleClickFace(FACE); });
    expect([taken, requester.mock.calls]).toEqual([true, [['manual']]]);
    // Studio switches every view to CAD: the layout comes back in the tab's settings.
    rerender({ layout: 'manual' });
    await waitFor(() => expect(result.current.edit.selected).toBe('plate.py:11'));
    expect(lookAt).not.toHaveBeenCalled();
    // Once: the face is not selected again on a later trip through the AI's layout.
    act(() => result.current.edit.select(null));
    rerender({ layout: 'ai' });
    rerender({ layout: 'manual' });
    await act(async () => {});
    expect(result.current.edit.selected).toBe(null);
  });

  it('keeps Normal To in a viewer no host lays out, on a plain STEP, and under any tool but Select', async () => {
    // Jake's own viewer: no host takes the ask.
    const standalone = mount(server(), { layout: 'ai' });
    await waitFor(() => expect(standalone.result.current.edit.status).toBe('ready'));
    expect(standalone.result.current.doubleClickFace(FACE)).toBe(false);
    standalone.unmount();
    const { requester, release } = studio();
    released = release;
    // A plain STEP, in Studio: nothing to model, so nothing is asked.
    const step = mount(server({ file: '/work/bought/bracket.step' }), { layout: 'ai', file: '/work/bought/bracket.step' });
    await waitFor(() => expect(step.result.current.edit.status).toBe('none'));
    expect(step.result.current.doubleClickFace(FACE)).toBe(false);
    step.unmount();
    // Measure's double-click is Measure's.
    const measuring = mount(server(), { layout: 'ai', toolMode: 'measure' });
    await waitFor(() => expect(measuring.result.current.edit.status).toBe('ready'));
    expect(measuring.result.current.doubleClickFace(FACE)).toBe(false);
    expect(requester).not.toHaveBeenCalled();
  });

  it('lets go of the face when Studio refuses the switch, or when the next press comes first', async () => {
    const { release } = studio(async () => { throw new Error('Finish or cancel the command first'); });
    released = release;
    const client = server();
    const refused = mount(client, { layout: 'ai' });
    await waitFor(() => expect(refused.result.current.edit.status).toBe('ready'));
    await act(async () => { refused.result.current.doubleClickFace(FACE); });
    // CAD comes later by the switch itself: the refused face is not selected then.
    refused.rerender({ layout: 'manual' });
    await waitFor(() => expect(refused.result.current.editing).toBe(true));
    await act(async () => {});
    expect(refused.result.current.edit.selected).toBe(null);
    refused.unmount();
    released();
    released = studio().release;
    const pressed = mount(server(), { layout: 'ai' });
    await waitFor(() => expect(pressed.result.current.edit.status).toBe('ready'));
    act(() => { pressed.result.current.doubleClickFace(FACE); });
    act(() => { pressed.result.current.beforePick(null, false); });
    pressed.rerender({ layout: 'manual' });
    await waitFor(() => expect(pressed.result.current.editing).toBe(true));
    await act(async () => {});
    expect(pressed.result.current.edit.selected).toBe(null);
  });

  it('in CAD, empty space goes back to the AI with nothing open, and leaves an open command or an isolation be', async () => {
    const { requester, release } = studio();
    released = release;
    const { result, rerender } = mount(server(), { layout: 'manual' });
    await waitFor(() => expect(result.current.editing).toBe(true));
    expect(result.current.doubleClickEmpty()).toBe(true);
    expect(requester).toHaveBeenLastCalledWith('ai');
    rerender({ layout: 'manual', isolated: true });
    expect(result.current.doubleClickEmpty()).toBe(false);
    rerender({ layout: 'manual' });
    act(() => result.current.edit.open('fillet'));
    expect(result.current.doubleClickEmpty()).toBe(false);
    expect(requester).toHaveBeenCalledTimes(1);
  });
});
