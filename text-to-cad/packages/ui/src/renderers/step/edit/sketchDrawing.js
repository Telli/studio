/**
 * Drawing a sketch over the viewport: its plane placed in the view (a place on the sketch to the
 * screen and back, through the model's own transform), its curves as screen paths, arrowheads,
 * and the colors a CAD tool gives a sketch, read from the viewer's own text color so a dark
 * viewer draws a defined sketch light.
 */
import { arcSweep } from "./sketchMode.js";

/**
 * Whether a viewer's text color is light, so the viewer is dark. The theme writes it as oklch (its
 * lightness first, 0 to 1 or a percentage); a browser may hand it back as rgb.
 */
export function lightText(text) {
  const oklch = /^oklch\(\s*([\d.]+)(%?)/i.exec(text);
  const [r, g, b] = (text.match(/[\d.]+/g) || ["20", "20", "20"]).map(Number);
  const lightness = oklch ? Number(oklch[1]) / (oklch[2] ? 100 : 1) : (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lightness > 0.55;
}

/** The sketch's colors, as SolidWorks gives them: blue while it can move, black (the text color here) once defined. */
export function colorsFor(host) {
  const style = getComputedStyle(host);
  const text = style.color || "rgb(20, 20, 20)";
  const dark = lightText(text);
  return {
    defined: text, under: dark ? "#60a5fa" : "#1d4ed8", over: "#ef4444", selected: "#06b6d4", hover: "#f97316",
    origin: "#dc2626", preview: dark ? "#93c5fd" : "#2563eb", label: dark ? "rgba(24, 24, 27, 0.9)" : "rgba(255, 255, 255, 0.92)",
    quiet: dark ? "rgba(226, 232, 240, 0.75)" : "rgba(30, 41, 59, 0.75)", font: style.fontFamily || "system-ui, sans-serif",
  };
}

/**
 * A sketch's plane in the view: `toScreen` a place on it (in its units) to the viewport's pixels,
 * or null behind the camera; `toLocal` a pixel to the place on the plane under it; `perUnit` the
 * pixels one unit spans; `key` what the layout depends on, to paint again only when it changed.
 */
export function planeMapping(runtime, width, height, frame, unit = 1) {
  if (!runtime?.camera || !runtime.modelGroup || !runtime.THREE || !frame) return null;
  const { THREE, camera, modelGroup } = runtime;
  camera.updateMatrixWorld();
  modelGroup.updateMatrixWorld();
  const O = new THREE.Vector3(...frame.origin);
  const X = new THREE.Vector3(...frame.x);
  const Y = new THREE.Vector3(...frame.y);
  const Z = new THREE.Vector3(...frame.z);
  const scratch = new THREE.Vector3();
  const toScreen = ([u, v]) => {
    scratch.copy(O).addScaledVector(X, u * unit).addScaledVector(Y, v * unit).applyMatrix4(modelGroup.matrixWorld);
    if (scratch.clone().applyMatrix4(camera.matrixWorldInverse).z >= 0) return null;
    scratch.project(camera);
    return [((scratch.x + 1) * width) / 2, ((1 - scratch.y) * height) / 2];
  };
  const raycaster = new THREE.Raycaster();
  const inverse = modelGroup.matrixWorld.clone().invert();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(Z, O);
  const hit = new THREE.Vector3();
  const toLocal = ([x, y]) => {
    raycaster.setFromCamera(new THREE.Vector2((x / width) * 2 - 1, 1 - (y / height) * 2), camera);
    const ray = raycaster.ray.clone().applyMatrix4(inverse);
    if (!ray.intersectPlane(plane, hit)) return null;
    const offset = hit.clone().sub(O);
    return [offset.dot(X) / unit, offset.dot(Y) / unit];
  };
  const a = toScreen([0, 0]);
  const b = toScreen([1, 0]);
  const perUnit = a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) || 1 : 1;
  return { toScreen, toLocal, perUnit, key: [width, height, camera.matrixWorld.elements.join(), camera.projectionMatrix.elements.join(),
    modelGroup.matrixWorld.elements.join()].join("|") };
}

/** Points around a circle, or along an arc of it from `from` sweeping `sweep` radians. */
export function circlePoints(c, r, from = 0, sweep = 2 * Math.PI) {
  const steps = Math.max(12, Math.min(160, Math.ceil(Math.abs(sweep) * 24)));
  return Array.from({ length: steps + 1 }, (_, index) => {
    const angle = from + (sweep * index) / steps;
    return [c[0] + r * Math.cos(angle), c[1] + r * Math.sin(angle)];
  });
}

/** A curve of `sketchGeometry` as points along it. */
export function curvePoints(curve) {
  if (curve.kind === "line") return curve.view || [curve.a, curve.b];
  if (curve.kind === "circle") return circlePoints(curve.c, curve.r);
  const { start, sweep } = arcSweep(curve);
  return circlePoints(curve.c, curve.r, start, sweep);
}

/** Strokes a path through places on the sketch, broken where one is behind the camera. */
export function strokePath(context, points, toScreen, closed = false) {
  let started = false;
  context.beginPath();
  for (const point of points) {
    const screen = toScreen(point);
    if (!screen) { started = false; continue; }
    if (started) context.lineTo(screen[0], screen[1]); else { context.moveTo(screen[0], screen[1]); started = true; }
  }
  if (closed) context.closePath();
  context.stroke();
}

/** An arrowhead at `tip`, pointing away from `from`. */
export function arrowHead(context, tip, from, size) {
  const length = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1;
  const ux = (tip[0] - from[0]) / length;
  const uy = (tip[1] - from[1]) / length;
  context.beginPath();
  context.moveTo(tip[0], tip[1]);
  context.lineTo(tip[0] - ux * size - uy * size * 0.4, tip[1] - uy * size + ux * size * 0.4);
  context.lineTo(tip[0] - ux * size + uy * size * 0.4, tip[1] - uy * size - ux * size * 0.4);
  context.closePath();
  context.fill();
}

/** Whether two label boxes ({x, y, w, h}) cover each other. */
export const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
