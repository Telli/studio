/**
 * What a scan for engineering files looks for (Studio's Import: the desktop app walks the folders,
 * `apps/desktop/src/studio/studioImport.ts`, and the web proposes projects, `workbench/importPlan.ts`).
 */
export type StudioImportKind = "model" | "drawing" | "partsList" | "datasheet" | "photo" | "notes";

const MODEL_EXTENSIONS = new Set([
  "step",
  "stp",
  "iges",
  "igs",
  "stl",
  "3mf",
  "obj",
  "brep",
  "x_t",
  "x_b",
  "sldprt",
  "sldasm",
  "f3d",
  "f3z",
  "ipt",
  "iam",
  "prt",
  "asm",
  "catpart",
  "catproduct",
  "fcstd",
  "scad",
  "kicad_pcb",
  "kicad_sch",
]);
const DRAWING_EXTENSIONS = new Set(["dxf", "dwg", "slddrw", "idw", "drw"]);
const PHOTO_EXTENSIONS = new Set(["jpg", "jpeg", "png", "heic", "webp"]);
const NOTE_EXTENSIONS = new Set(["md", "txt", "docx", "doc", "rtf", "pages"]);

/** The kind of engineering file a path is, by its extension and, for PDFs and sheets, its name. */
export function studioImportKind(path: string): StudioImportKind | null {
  const name = path.split(/[\\/]/).pop()?.toLowerCase() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  const extension = name.slice(dot + 1);
  if (MODEL_EXTENSIONS.has(extension)) return "model";
  if (DRAWING_EXTENSIONS.has(extension)) return "drawing";
  if (PHOTO_EXTENSIONS.has(extension)) return "photo";
  if (extension === "pdf") {
    if (/drawing|drw|dwg|print/.test(name)) return "drawing";
    if (/datasheet|data sheet|spec|manual/.test(name)) return "datasheet";
    return "notes";
  }
  if (extension === "csv" || extension === "xlsx" || extension === "xls") {
    return /bom|parts|bill/.test(name) ? "partsList" : "notes";
  }
  return NOTE_EXTENSIONS.has(extension) ? "notes" : null;
}
