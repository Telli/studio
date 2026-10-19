import * as THREE from 'three';
import { expect, it } from 'vitest';
import { createResultPreview, markResultView } from '../../../dist/renderers/glb/resultPreview.js';

// An editor's scene of two file nodes, the result mesh and a tool, with a sibling made as core's builder makes one: a
// copy of the file's hierarchy, which says what it still holds when it is disposed.
function editorScene() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = 'part';
  const tool = new THREE.Object3D();
  tool.name = 'tool:T1';
  const root = new THREE.Group();
  root.add(mesh, tool);
  const disposed: string[][] = [];
  const scene = {
    document: { scene: root },
    restBounds: { min: [0, 0, 0], max: [1, 1, 1] },
    previewBounds: { min: [0, 0, 0], max: [1, 3, 1] },
    createSibling() {
      const copy = root.clone();
      return {
        document: { scene: copy }, object3D: copy, bounds: null, restBounds: null,
        dispose() { const held: string[] = []; copy.traverse((object) => { if (object !== copy) held.push(object.name || object.type); }); disposed.push(held); },
      };
    },
  };
  return { scene, root, mesh, tool, disposed };
}

it('copies the file without what the result\'s view hung on it, and frames the whole routine', () => {
  const { scene, mesh } = editorScene();
  const markers = markResultView(new THREE.Group());
  mesh.add(markers);
  const preview = createResultPreview(THREE, scene)!;
  expect(preview.scene.restBounds).toBe(scene.previewBounds);
  const copy = preview.copyOf(mesh)!;
  expect(copy).not.toBe(mesh);
  expect(copy.name).toBe('part');
  expect(copy.children).toHaveLength(0);
  // The editor's own markers are back where they hung.
  expect(markers.parent).toBe(mesh);
  expect(createResultPreview(THREE, { document: { scene: new THREE.Group() } })).toBeNull();
});

it('mirrors the view\'s objects over the same buffers, follows the file\'s nodes, and drops a mirror whose object went', () => {
  const { scene, root, mesh, tool } = editorScene();
  const preview = createResultPreview(THREE, scene)!;
  // Markers made after Preview opened, two of three instances drawn; the tool moved and put away; the mesh lifted.
  const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(), new THREE.MeshBasicMaterial(), 3);
  cones.count = 2;
  const markers = markResultView(new THREE.Group());
  markers.add(cones);
  mesh.add(markers);
  tool.position.set(1, 2, 3);
  tool.visible = false;
  mesh.matrixAutoUpdate = false;
  mesh.matrix.makeTranslation(0, 5, 0);
  preview.sync();
  const copy = preview.copyOf(mesh)!;
  const mirrored = copy.children[0].children[0] as THREE.InstancedMesh;
  expect(mirrored).not.toBe(cones);
  expect(mirrored.geometry).toBe(cones.geometry);
  expect(mirrored.material).toBe(cones.material);
  expect(mirrored.instanceMatrix).toBe(cones.instanceMatrix);
  expect(mirrored.count).toBe(2);
  expect(preview.copyOf(tool)!.position.toArray()).toEqual([1, 2, 3]);
  expect(preview.copyOf(tool)!.visible).toBe(false);
  expect([copy.matrixAutoUpdate, copy.matrix.elements[13]]).toEqual([false, 5]);
  // A marker re-placed is the same buffer; one drawn more is counted at the next sync.
  cones.count = 3;
  preview.sync();
  expect(mirrored.count).toBe(3);
  // The markers taken away, a floor put down beside the part: Preview's follow.
  markers.removeFromParent();
  const floor = markResultView(new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()));
  root.add(floor);
  preview.sync();
  expect(copy.children).toHaveLength(0);
  expect(preview.scene.document.scene.children.filter((child: any) => child.geometry === floor.geometry)).toHaveLength(1);
});

it('lets go of its mirrors before the sibling releases what it holds', () => {
  const { scene, mesh, disposed } = editorScene();
  const preview = createResultPreview(THREE, scene)!;
  mesh.add(markResultView(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial())));
  preview.sync();
  expect(preview.copyOf(mesh)!.children).toHaveLength(1);
  preview.dispose();
  expect(disposed).toEqual([['part', 'tool:T1']]);
  // Disposed, it syncs nothing.
  preview.sync();
  expect(preview.copyOf(mesh)!.children).toHaveLength(0);
});
