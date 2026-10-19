import { cleanup, render, waitFor } from '@testing-library/react';
import * as THREE from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import PreviewLayer from '../../../../dist/renderers/step/edit/PreviewLayer.js';
import SketchesLayer from '../../../../dist/renderers/step/edit/SketchesLayer.js';

// What the layers draw, kept by a 2D context that draws nothing: the tags' words and how many fills.
let texts: string[] = [];
let fills = 0;

beforeEach(() => {
  texts = [];
  fills = 0;
  const ignore = () => {};
  const context = {
    canvas: { clientWidth: 800 }, save: ignore, restore: ignore, beginPath: ignore, moveTo: ignore, lineTo: ignore, closePath: ignore, stroke: ignore,
    arc: ignore, rect: ignore, roundRect: ignore, setTransform: ignore, clearRect: ignore, setLineDash: ignore,
    fill: () => { fills += 1; }, fillText: (text: string) => { texts.push(text); }, measureText: (text: string) => ({ width: text.length * 6 }),
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as never);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(performance.now()), 0));
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// A view of the part from above and to one side, the model unmoved.
function viewport() {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { value: 800 });
  Object.defineProperty(host, 'clientHeight', { value: 600 });
  document.body.append(host);
  const camera = new THREE.PerspectiveCamera(45, 800 / 600, 1, 1000);
  camera.up.set(0, 0, 1);
  camera.position.set(60, -80, 60);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
  return { runtimeRef: { current: { THREE, camera, modelGroup: new THREE.Group() } }, hostRef: { current: host }, viewerReadyTick: 1 };
}

it('an extrude is shaded as a solid with its arrow and depth, and a revolve with its turn and angle', async () => {
  const view = viewport();
  const sketch = { file: 'a.py', line: 4, name: 'Sketch1', state: { frame: { origin: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }, unit: 1,
    loops: [[[-5, -5], [5, -5], [5, 5], [-5, 5]]], curves: [] } };
  const extrude = { kind: 'boss', end: 'blind', file: 'a.py', line: 4, taper: 0, depth: 10, reverse: false, label: '10 mm' };
  const { rerender } = render(<SketchesLayer viewport={view} sketches={[sketch]} selected={sketch} preview={extrude} through={50} />);
  await waitFor(() => expect(texts).toContain('10 mm'));
  expect(fills).toBeGreaterThan(0);
  // Where the body ends it, the arrow alone; a revolve a quarter turn about a line beside the profile.
  rerender(<SketchesLayer viewport={view} sketches={[sketch]} selected={sketch} through={50}
    preview={{ ...extrude, depth: 0, end: 'next', arrowOnly: true, label: 'Up To Next' }} />);
  await waitFor(() => expect(texts).toContain('Up To Next'));
  rerender(<SketchesLayer viewport={view} sketches={[sketch]} selected={null} through={50}
    preview={{ kind: 'cut', revolve: { a: [-8, -10], b: [-8, 10], angle: 90 }, file: 'a.py', line: 4, label: '90°' }} />);
  await waitFor(() => expect(texts).toContain('90°'));
});

it("a linear pattern's arrow runs along its copies and a hole's goes into its face, each tagged", async () => {
  const view = viewport();
  // Two copies of a 2 mm cube, 10 and 20 along X from one at the origin.
  const cube = (x: number) => [x - 1, -1, -1, x + 1, 1, 1];
  const added = { positions: [...cube(10), ...cube(20)], triangles: [0, 1, 0], edges: [] };
  const pattern = { mark: 'pattern', along: [1, 0, 0], spacing: 10, count: 3, label: '10 mm' };
  const { rerender } = render(<PreviewLayer viewport={view} preview={{ added, removed: null }} mark={pattern} extent={40} />);
  await waitFor(() => expect(texts).toContain('10 mm'));
  rerender(<PreviewLayer viewport={view} preview={null} mark={{ mark: 'hole', at: [0, 0, 2], into: [0, 0, -1], label: 'Through All' }} extent={40} />);
  await waitFor(() => expect(texts).toContain('Through All'));
});
