/**
 * The editor's 3D view: SolidCraft's mesh of the design with its edges, the sketch dimensions'
 * lines over it, an orbit camera with Z up as SolidCraft has it, and the screen position of each
 * dimension's label for the page to draw as a chip. It draws only when something changes: no
 * frame loop.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

import type {
  ModelDimension,
  Vec3,
} from "../../../../apps/web/src/components/workbench/solidcraft/dimensions";

export interface ViewportColors {
  readonly background: string;
  readonly model: string;
  readonly edge: string;
  readonly dimension: string;
  readonly dimensionActive: string;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
  readonly visible: boolean;
}

export class PartViewport {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100000);
  private readonly controls: OrbitControls;
  private readonly model = new THREE.Group();
  private readonly annotations = new THREE.Group();
  private readonly headlight = new THREE.DirectionalLight(0xffffff, 1.6);
  private readonly listeners = new Set<() => void>();
  private readonly resizeObserver: ResizeObserver;
  private frame = 0;
  private scheduled = false;
  private colors: ViewportColors;
  private dimensions: ReadonlyArray<ModelDimension> = [];
  private active: string | null = null;

  constructor(
    private readonly container: HTMLElement,
    colors: ViewportColors,
  ) {
    this.colors = colors;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(120, -160, 110);
    this.camera.add(this.headlight);
    this.headlight.position.set(0.4, 0.8, 1);
    this.scene.add(this.camera, this.model, this.annotations);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3d44, 1.1));
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = false;
    this.controls.addEventListener("change", () => this.request());
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.applyColors();
    this.resize();
  }

  /** Called after every draw, so labels can follow the camera. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  get version() {
    return this.frame;
  }

  setColors(colors: ViewportColors) {
    this.colors = colors;
    this.applyColors();
    this.setDimensions(this.dimensions, this.active);
  }

  /** The design's mesh (binary STL, base64), framed the first time one arrives. */
  setMesh(base64: string | null) {
    for (const child of this.model.children) disposeObject(child);
    this.model.clear();
    if (base64 !== null) {
      const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
      const geometry = new STLLoader().parse(bytes.buffer);
      geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
          color: this.colors.model,
          roughness: 0.62,
          metalness: 0.08,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        }),
      );
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 28),
        new THREE.LineBasicMaterial({ color: this.colors.edge }),
      );
      this.model.add(mesh, edges);
    }
    this.request();
  }

  setDimensions(dimensions: ReadonlyArray<ModelDimension>, active: string | null) {
    this.dimensions = dimensions;
    this.active = active;
    for (const child of this.annotations.children) disposeObject(child);
    this.annotations.clear();
    const build = (lines: ReadonlyArray<readonly [Vec3, Vec3]>, color: string) => {
      if (lines.length === 0) return;
      const positions = lines.flatMap(([a, b]) => [...a, ...b]);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const segments = new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.9 }),
      );
      segments.renderOrder = 10;
      this.annotations.add(segments);
    };
    build(
      dimensions
        .filter((dimension) => dimension.param !== active)
        .flatMap((dimension) => dimension.lines),
      this.colors.dimension,
    );
    build(
      dimensions
        .filter((dimension) => dimension.param === active)
        .flatMap((dimension) => dimension.lines),
      this.colors.dimensionActive,
    );
    this.request();
  }

  /** A world point on screen, in the container's pixels. */
  project(point: Vec3): ScreenPoint {
    const v = new THREE.Vector3(point[0], point[1], point[2]).project(this.camera);
    const { clientWidth: width, clientHeight: height } = this.container;
    return {
      x: ((v.x + 1) / 2) * width,
      y: ((1 - v.y) / 2) * height,
      visible: v.z > -1 && v.z < 1,
    };
  }

  /** Frames the model, or the model and its dimensions, from the corner a drawing's iso view uses. */
  fit() {
    const box = new THREE.Box3().setFromObject(this.model);
    box.union(new THREE.Box3().setFromObject(this.annotations));
    if (box.isEmpty()) return;
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length() || 50;
    const direction = new THREE.Vector3(1, -1.25, 0.95).normalize();
    this.controls.target.copy(centre);
    this.camera.position.copy(centre).addScaledVector(direction, size * 1.55);
    this.camera.near = size / 100;
    this.camera.far = size * 100;
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.request();
  }

  dispose() {
    this.resizeObserver.disconnect();
    this.controls.dispose();
    disposeObject(this.scene);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private applyColors() {
    this.scene.background = new THREE.Color(this.colors.background);
    this.model.traverse((object) => {
      if (object instanceof THREE.Mesh)
        (object.material as THREE.MeshStandardMaterial).color.set(this.colors.model);
      if (object instanceof THREE.LineSegments)
        (object.material as THREE.LineBasicMaterial).color.set(this.colors.edge);
    });
    this.request();
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.container;
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = `${width}px`;
    this.renderer.domElement.style.height = `${height}px`;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.request();
  }

  private request() {
    if (this.scheduled) return;
    this.scheduled = true;
    requestAnimationFrame(() => {
      this.scheduled = false;
      this.renderer.render(this.scene, this.camera);
      this.frame += 1;
      for (const listener of this.listeners) listener();
    });
  }
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
      child.geometry.dispose();
      const material = child.material as THREE.Material | THREE.Material[];
      for (const each of Array.isArray(material) ? material : [material]) each.dispose();
    }
  });
}
