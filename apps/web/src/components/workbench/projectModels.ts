import { humanName } from "./partNames";
import type { ProjectFile } from "./projectFiles";

/**
 * A cadgen 0.8 model of a project's folder: a part script's `@model`, as the engine's Recents lists
 * it once it has been built. A model has no file of its own (its script writes none), so the
 * workbench lists it by its document id, which is what opens it, pictures it and runs its jobs.
 */
export interface ProjectModel {
  /** Its document id. */
  readonly id: string;
  /** Its function's name, as the engine names the document. */
  readonly name: string;
  /** Its script, relative to the folder, with forward slashes. */
  readonly script: string;
  /** When the engine last built it (Recents' `updated`, seconds), as a picture's version. */
  readonly updated: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const slashes = (path: string) => path.replaceAll("\\", "/").replace(/\/+$/, "");

/**
 * The models Recents (`/__cad/recents`) lists whose script is in `root`, in its order. Only a
 * model's record counts: a shape handed over (CAD mode's rollback bar's body, `kind: "shape"`) is
 * no part of the project, a model whose script is gone (`missing`) is not listed, and a file's
 * record is the folder's file itself.
 */
export function readProjectModels(recents: unknown, root: string): ProjectModel[] {
  const list = isRecord(recents) && Array.isArray(recents.recents) ? recents.recents : [];
  const base = `${slashes(root)}/`;
  const models: ProjectModel[] = [];
  for (const recent of list) {
    if (!isRecord(recent) || recent.kind !== "model" || recent.missing === true) continue;
    const { id, name, script, updated } = recent;
    if (typeof id !== "string" || typeof script !== "string") continue;
    const where = slashes(script);
    if (!where.startsWith(base)) continue;
    models.push({
      id,
      name: typeof name === "string" && name !== "" ? name : id,
      script: where.slice(base.length),
      updated: typeof updated === "number" ? String(updated) : null,
    });
  }
  return models;
}

/**
 * A model as the project lists a part: by its document id (`path`), named as the engine names it,
 * filed in its script's folder under the script's name, so the checks run on it (named after its
 * script, as cadgen names a model's outputs) find it.
 */
export function modelProjectFile(model: ProjectModel): ProjectFile {
  const segments = model.script.split("/");
  const name = segments.at(-1) ?? model.script;
  return {
    path: model.id,
    name,
    title: humanName(model.name),
    folder: segments.slice(0, -1).join("/"),
    group: "CAD",
    kind: "Part",
    document: model.id,
    script: model.script,
    ...(model.updated === null ? {} : { version: model.updated }),
  };
}

/** A folder's files as the project lists them, with its models among its parts. */
export function withModels(
  files: ReadonlyArray<ProjectFile>,
  models: ReadonlyArray<ProjectModel> | undefined,
): ProjectFile[] {
  return [...files, ...(models ?? []).map(modelProjectFile)];
}

/** The picture version of each model among `files`, by its id: what its picture is cached by. */
export function pictureVersions(files: ReadonlyArray<ProjectFile>): Record<string, string> {
  const versions: Record<string, string> = {};
  for (const file of files) {
    if (file.document !== undefined && file.version !== undefined)
      versions[file.document] = file.version;
  }
  return versions;
}
