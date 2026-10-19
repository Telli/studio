// Preview's scene for a result (an FEA study's, a CAM job's).
//
// Preview draws a scene of its own beside the editor's: the editor scene's sibling (`createSibling()`, core's
// `glbScene.js`), its own objects in Render's look over the editor's geometry, whose buffers both scenes share. A
// result's colours and the deformation it draws are written into those buffers, so they are on Preview's scene as
// they are on the editor's. Everything else a result's view does is done to the editor's objects: it shows, hides and
// moves the file's nodes (a CAM job's tool and stock, a drop's fall) and hangs objects of its own on them (an FEA
// result's markers, tracers and floor, a CAM job's paths), each marked as the view's (`markResultView`).
//
// `sync()` carries that onto Preview's scene: every file node shown, hidden and placed as the editor's is, and every
// one of the view's own objects mirrored over the same geometry, materials and instance buffers, made as it appears
// and taken away as it goes. The result's view goes on drawing the editor's scene alone; the renderer calls `sync()`
// after each change it makes while Preview is open. Importing this module has no environmental effects.

const RESULT_VIEW = "cadResultView";

/** Marks an object a result's view hangs on the scene: Preview mirrors it rather than copying it with the file. */
export function markResultView(object) {
  object.userData[RESULT_VIEW] = true;
  return object;
}

const isViewObject = (object) => object.userData?.[RESULT_VIEW] === true;

// The outermost of the view's own objects under `root`, in the order they hang.
function viewObjects(root, found = []) {
  for (const child of root.children) {
    if (isViewObject(child)) found.push(child);
    else viewObjects(child, found);
  }
  return found;
}

// Shown and placed as `from` is: by its parts while it keeps them in step, by its matrix once it is set directly.
function place(from, to) {
  to.visible = from.visible;
  to.renderOrder = from.renderOrder;
  to.frustumCulled = from.frustumCulled;
  if (from.matrixAutoUpdate) {
    to.matrixAutoUpdate = true;
    to.position.copy(from.position);
    to.quaternion.copy(from.quaternion);
    to.scale.copy(from.scale);
  } else {
    to.matrixAutoUpdate = false;
    to.matrix.copy(from.matrix);
    to.matrixWorldNeedsUpdate = true;
  }
}

// What a mirror draws with is its source's own: the same geometry, materials and instance buffers.
function share(from, to) {
  if (from.isInstancedMesh) {
    to.instanceMatrix = from.instanceMatrix;
    to.instanceColor = from.instanceColor;
    to.count = from.count;
  }
  if (from.geometry && to.geometry !== from.geometry) to.geometry = from.geometry;
  if (from.material && to.material !== from.material) to.material = from.material;
}

function mirror(from) {
  const to = from.clone(false);
  share(from, to);
  for (const child of from.children) to.add(mirror(child));
  return to;
}

function syncMirror(from, to) {
  place(from, to);
  share(from, to);
  // A view's object whose parts changed is mirrored again whole.
  if (from.children.length !== to.children.length) {
    for (const child of [...to.children]) to.remove(child);
    for (const child of from.children) to.add(mirror(child));
    return;
  }
  from.children.forEach((child, index) => syncMirror(child, to.children[index]));
}

/**
 * @param {typeof import("three")} THREE
 * @param {object} scene  The editor's GLB scene (`createGlbScene`): its `document.scene`, `createSibling()` and the
 *   bounds the result grew it to (`restBounds`, and `previewBounds` for a drop's whole fall).
 * @returns {{ scene: object, copyOf(object: import("three").Object3D): import("three").Object3D | null, sync(): void,
 *   dispose(): void } | null}  `scene` is Preview's; `copyOf` is a file object's copy in it (the result mesh a label is
 *   projected through). Null for a scene that has no sibling to give.
 */
export function createResultPreview(THREE, scene) {
  const source = scene?.document?.scene;
  if (!source || typeof scene.createSibling !== "function") return null;
  // The view's own objects are put aside while the sibling is made: Preview mirrors them instead of copying them as
  // the file's, so the sibling never holds (nor disposes) what the editor's view drew with.
  const aside = viewObjects(source).map((object) => [object, object.parent]);
  for (const [object, parent] of aside) parent.remove(object);
  let sibling;
  try {
    sibling = scene.createSibling();
  } finally {
    for (const [object, parent] of aside) parent.add(object);
  }
  // Preview frames the box the result is drawn in over its whole series and routine (a drop's whole fall).
  const framed = scene.previewBounds || scene.restBounds || null;
  if (framed) Object.assign(sibling, { bounds: framed, restBounds: framed });
  // Each file object paired with its copy: the copy has the file's structure, without the view's objects.
  const copies = new Map();
  const pair = (from, to) => {
    copies.set(from, to);
    from.children.filter((child) => !isViewObject(child)).forEach((child, index) => {
      if (to.children[index]) pair(child, to.children[index]);
    });
  };
  pair(source, sibling.document.scene);
  const mirrors = new Map();
  let disposed = false;
  return {
    scene: sibling,
    copyOf: (object) => copies.get(object) || null,
    sync() {
      if (disposed) return;
      for (const [from, to] of copies) {
        place(from, to);
        // A geometry rewritten in place (a deformation drawn) keeps its bounds on the source's copy: culling reads them.
        if (from.geometry && to.geometry !== from.geometry) {
          if (from.geometry.boundingSphere) (to.geometry.boundingSphere ||= new THREE.Sphere()).copy(from.geometry.boundingSphere);
          if (from.geometry.boundingBox) (to.geometry.boundingBox ||= new THREE.Box3()).copy(from.geometry.boundingBox);
        }
      }
      const current = viewObjects(source);
      for (const [object, copy] of mirrors) {
        if (!current.includes(object)) { copy.removeFromParent(); mirrors.delete(object); }
      }
      for (const object of current) {
        let copy = mirrors.get(object);
        if (!copy) {
          const parent = copies.get(object.parent);
          if (!parent) continue;
          copy = mirror(object);
          parent.add(copy);
          mirrors.set(object, copy);
        }
        syncMirror(object, copy);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // The mirrors draw with the editor's geometry and materials: they leave before the sibling releases its own.
      for (const copy of mirrors.values()) copy.removeFromParent();
      mirrors.clear();
      sibling.dispose();
    },
  };
}
