/**
 * The sketch pad's drawing, as plain data. A sketch is a rough drawing with exact numbers: shapes are
 * not to scale, and only what the engineer types is a size. The agent gets a picture and, where the
 * server takes files, the same sketch in words, so a number is never left to be read off pixels.
 */

export const SKETCH_WIDTH = 960;
export const SKETCH_HEIGHT = 600;
export const SKETCH_GRID = 20;

export interface SketchPoint {
  readonly x: number;
  readonly y: number;
}

export type SketchShape =
  | {
      readonly kind: "line" | "arrow" | "rectangle";
      readonly from: SketchPoint;
      readonly to: SketchPoint;
    }
  | { readonly kind: "circle"; readonly centre: SketchPoint; readonly edge: SketchPoint }
  | {
      readonly kind: "dimension";
      readonly from: SketchPoint;
      readonly to: SketchPoint;
      readonly value: string;
    }
  | { readonly kind: "text"; readonly at: SketchPoint; readonly value: string };

export type SketchTool = SketchShape["kind"];

/** Half a grid square, so a shape lands on the grid or halfway along it. */
export function snapToSketchGrid(point: SketchPoint): SketchPoint {
  const step = SKETCH_GRID / 2;
  const snap = (value: number, limit: number) =>
    Math.min(limit, Math.max(0, Math.round(value / step) * step));
  return { x: snap(point.x, SKETCH_WIDTH), y: snap(point.y, SKETCH_HEIGHT) };
}

/** The shape a drag makes, or null while it is too short to be one. */
export function sketchShapeFromDrag(
  tool: Exclude<SketchTool, "dimension" | "text">,
  from: SketchPoint,
  to: SketchPoint,
): SketchShape | null {
  if (from.x === to.x && from.y === to.y) return null;
  return tool === "circle" ? { kind: "circle", centre: from, edge: to } : { kind: tool, from, to };
}

export function moveSketchShape(shape: SketchShape, dx: number, dy: number): SketchShape {
  const by = (point: SketchPoint) => ({ x: point.x + dx, y: point.y + dy });
  switch (shape.kind) {
    case "circle":
      return { ...shape, centre: by(shape.centre), edge: by(shape.edge) };
    case "text":
      return { ...shape, at: by(shape.at) };
    default:
      return { ...shape, from: by(shape.from), to: by(shape.to) };
  }
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Keeps a number from printing as 200.00000000000003. */
function short(value: number) {
  return String(Math.round(value * 100) / 100);
}

function radius(shape: Extract<SketchShape, { kind: "circle" }>) {
  return Math.hypot(shape.edge.x - shape.centre.x, shape.edge.y - shape.centre.y);
}

function arrowHead(tip: SketchPoint, tail: SketchPoint, size: number) {
  const angle = Math.atan2(tip.y - tail.y, tip.x - tail.x);
  const corner = (turn: number) =>
    `${short(tip.x - size * Math.cos(angle + turn))},${short(tip.y - size * Math.sin(angle + turn))}`;
  return `<polygon points="${short(tip.x)},${short(tip.y)} ${corner(0.4)} ${corner(-0.4)}" fill="currentColor" stroke="none"/>`;
}

function segment(from: SketchPoint, to: SketchPoint) {
  return `<line x1="${short(from.x)}" y1="${short(from.y)}" x2="${short(to.x)}" y2="${short(to.y)}"/>`;
}

/** The label sits on a dimension line, with the background behind it so the line breaks for it. */
function dimensionMarkup(shape: Extract<SketchShape, { kind: "dimension" }>, paper: string) {
  const mid = { x: (shape.from.x + shape.to.x) / 2, y: (shape.from.y + shape.to.y) / 2 };
  const width = shape.value.length * 11 + 14;
  return [
    segment(shape.from, shape.to),
    arrowHead(shape.from, shape.to, 12),
    arrowHead(shape.to, shape.from, 12),
    `<rect x="${short(mid.x - width / 2)}" y="${short(mid.y - 13)}" width="${short(width)}" height="26" fill="${paper}" stroke="none"/>`,
    `<text x="${short(mid.x)}" y="${short(mid.y)}" text-anchor="middle" dominant-baseline="central" fill="currentColor" stroke="none" font-size="20" font-weight="600">${escapeXml(shape.value)}</text>`,
  ].join("");
}

function shapeMarkup(shape: SketchShape, paper: string) {
  switch (shape.kind) {
    case "line":
      return segment(shape.from, shape.to);
    case "arrow":
      return segment(shape.from, shape.to) + arrowHead(shape.to, shape.from, 16);
    case "rectangle": {
      const x = Math.min(shape.from.x, shape.to.x);
      const y = Math.min(shape.from.y, shape.to.y);
      const width = Math.abs(shape.to.x - shape.from.x);
      const height = Math.abs(shape.to.y - shape.from.y);
      return `<rect x="${short(x)}" y="${short(y)}" width="${short(width)}" height="${short(height)}"/>`;
    }
    case "circle":
      return `<circle cx="${short(shape.centre.x)}" cy="${short(shape.centre.y)}" r="${short(radius(shape))}"/>`;
    case "dimension":
      return dimensionMarkup(shape, paper);
    case "text":
      return `<text x="${short(shape.at.x)}" y="${short(shape.at.y)}" dominant-baseline="central" fill="currentColor" stroke="none" font-size="20">${escapeXml(shape.value)}</text>`;
  }
}

/** One `<g>` per shape, each carrying its index so the pad can tell which one was pressed. */
export function sketchShapesMarkup(
  shapes: ReadonlyArray<SketchShape>,
  { paper, selected }: { readonly paper: string; readonly selected?: number | null },
) {
  return shapes
    .map(
      (shape, index) =>
        `<g data-shape="${index}" data-selected="${index === selected}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" pointer-events="visiblePainted">${shapeMarkup(shape, paper)}</g>`,
    )
    .join("");
}

/** A whole sheet for the agent: dark ink on white with the grid, in a form the browser can rasterize. */
export function sketchDocument(shapes: ReadonlyArray<SketchShape>) {
  const minor = `<pattern id="grid" width="${SKETCH_GRID}" height="${SKETCH_GRID}" patternUnits="userSpaceOnUse"><path d="M ${SKETCH_GRID} 0 L 0 0 0 ${SKETCH_GRID}" fill="none" stroke="#dfe3e8" stroke-width="1"/></pattern>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SKETCH_WIDTH}" height="${SKETCH_HEIGHT}" viewBox="0 0 ${SKETCH_WIDTH} ${SKETCH_HEIGHT}" font-family="Helvetica, Arial, sans-serif" color="#14181b">`,
    `<defs>${minor}</defs>`,
    `<rect width="100%" height="100%" fill="#ffffff"/><rect width="100%" height="100%" fill="url(#grid)"/>`,
    sketchShapesMarkup(shapes, { paper: "#ffffff" }),
    `</svg>`,
  ].join("");
}

function squares(point: SketchPoint) {
  return `(${short(point.x / SKETCH_GRID)}, ${short(point.y / SKETCH_GRID)})`;
}

function describeShape(shape: SketchShape) {
  switch (shape.kind) {
    case "line":
      return `Line from ${squares(shape.from)} to ${squares(shape.to)}`;
    case "arrow":
      return `Arrow from ${squares(shape.from)} to ${squares(shape.to)}`;
    case "rectangle":
      return `Rectangle from ${squares(shape.from)} to ${squares(shape.to)}`;
    case "circle":
      return `Circle at ${squares(shape.centre)}, ${short(radius(shape) / SKETCH_GRID)} squares in radius`;
    case "dimension":
      return `Dimension ${shape.value} from ${squares(shape.from)} to ${squares(shape.to)}`;
    case "text":
      return `Note at ${squares(shape.at)}: ${shape.value}`;
  }
}

/** The sketch in words, for the agent to read beside the picture. */
export function describeSketch(shapes: ReadonlyArray<SketchShape>) {
  return [
    "A sketch drawn in Studio. It is not to scale: only the dimensions and notes typed here are sizes.",
    "Positions are in grid squares from the top left, and only show how the shapes sit together.",
    "",
    ...shapes.map(describeShape),
    "",
  ].join("\n");
}
