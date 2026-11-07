import type { ProjectFile } from "./projectFiles";

/**
 * The checks a project's parts have been through, read from the results the
 * text-to-cad plugin writes beside each part: an FEA study's `<name>.fea.json`
 * (or a named study's `<name>.<study>.json`), beside the model of its result
 * (`.glb`) that the viewer opens. A result holds its
 * findings (`check`, `severity` error, warning or info, `summary`, and a
 * `fix` with its own `summary` when the check names one) and, from newer
 * versions, a verdict (`status` ready or fix, a `headline`, counts).
 */

const RESULT_FILE = /\.fea\.json$/i;

/** Whether the file is a check's result the overview reads. */
export const isCheckResultPath = (path: string) => RESULT_FILE.test(path);

/**
 * Whether the file is a named FEA study's numbers, beside its picture: the FEA
 * skill keeps several studies of a part as `FEA/part.bracket-load.glb` and its
 * `part.bracket-load.json` (or `part.bracket-load.result.json`, as agents on
 * text-to-cad 0.10 save `cad fea solve --json`, whose picture may be `.fea.glb`).
 * `paths` are the folder's files.
 */
export const isNamedStudyPath = (path: string, paths: ReadonlySet<string>) =>
  /\.json$/i.test(path) &&
  !RESULT_FILE.test(path) &&
  [".glb", ".fea.glb"].some((picture) => paths.has(path.replace(/(\.result)?\.json$/i, picture)));

/** An FEA study's analysis, in the plain word the FEA skill gives it. */
const ANALYSIS_WORDS: Record<string, string> = {
  static: "Strength",
};

/** `fix`: an error to fix; `warnings`: passed with something to look at; `ready`: passed. */
export type CheckStatus = "fix" | "warnings" | "ready";

export interface CheckIssue {
  readonly severity: "error" | "warning";
  readonly summary: string;
  /** What the check says to change, when it names a fix. */
  readonly fix: string | null;
}

export interface CheckResult {
  /** The result file, relative to its folder. */
  readonly path: string;
  /** The result's model beside it, for the viewer. */
  readonly model: string;
  /** The checked part's file name ("bracket.step"), or the result's stem when it names none. */
  readonly part: string;
  /** What was checked, in a word or two: "Strength", "Vibration", "Casting", "Heat treatment". */
  readonly check: string;
  readonly status: CheckStatus;
  /** The verdict in a line: "1 to fix · shrinkage hot spot", "Ready to cast". */
  readonly headline: string;
  /** Errors first, then warnings. */
  readonly issues: ReadonlyArray<CheckIssue>;
  /** When the result was written (seconds), when its file says. */
  readonly written?: number;
}

const STATUS_RANK: Record<CheckStatus, number> = { fix: 2, warnings: 1, ready: 0 };

const baseName = (path: string) => path.replaceAll("\\", "/").split("/").at(-1) ?? path;

const stemOf = (name: string) => {
  const dot = name.indexOf(".");
  return (dot <= 0 ? name : name.slice(0, dot)).toLowerCase();
};

const sentence = (text: string) => text.trim().replace(/[.\s]+$/, "");

/** "heat_treatment" as a person says it: "Heat treatment". */
function humanize(name: string): string {
  const words = name.replaceAll(/[_-]+/g, " ").trim().toLowerCase();
  return words === "" ? words : words[0]!.toUpperCase() + words.slice(1);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const text = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

/** A result file's check, or null when the file is not one (or not yet whole). */
export function parseCheckResult(
  path: string,
  contents: string,
  modifiedAt?: string,
): CheckResult | null {
  let data: unknown;
  try {
    data = JSON.parse(contents);
  } catch {
    return null;
  }
  if (!isRecord(data) || !Array.isArray(data.findings)) return null;

  const issues = data.findings
    .flatMap((finding): CheckIssue[] => {
      if (!isRecord(finding)) return [];
      const severity = finding.severity;
      const summary = text(finding.summary);
      if ((severity !== "error" && severity !== "warning") || summary === null) return [];
      const fix = isRecord(finding.fix) ? text(finding.fix.summary) : null;
      return [{ severity, summary, fix }];
    })
    .toSorted((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1));

  const verdict = isRecord(data.verdict) ? data.verdict : null;
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const status: CheckStatus =
    verdict?.status === "fix" || (verdict === null && errors > 0)
      ? "fix"
      : issues.length > 0
        ? "warnings"
        : "ready";

  // text-to-cad 0.10's `cad fea solve --json` names no generator: its study, and its picture at the
  // top. An agent saves it beside that picture, which stays its own when the files are renamed.
  const solved = isRecord(data.study) && text(data.glb) !== null;
  const picture = isRecord(data.files) ? text(data.files.glb) : null;
  const fea = /\.fea\.json$/i.test(path) || data.generator === "cadgen fea" || solved;
  const study = isRecord(data.study) ? data.study : null;
  const summary = isRecord(data.summary) ? data.summary : null;
  const analysis = text(data.analysis) ?? text(study?.analysis);
  // An FEA study's check as the viewer's verdict names it ("Strength"), else its analysis's word.
  const named =
    Array.isArray(summary?.checks) && isRecord(summary.checks[0])
      ? text(summary.checks[0].label)
      : null;
  const safety = typeof summary?.safety_factor === "number" ? summary.safety_factor : null;
  const name = baseName(path);
  const namedPicture = path.replace(/(\.result)?\.json$/i, ".fea.glb");
  const folder = path
    .replaceAll("\\", "/")
    .slice(0, path.replaceAll("\\", "/").lastIndexOf("/") + 1);
  return {
    path,
    model: solved
      ? baseName(text(data.glb) ?? "") === baseName(namedPicture)
        ? namedPicture
        : path.replace(/(\.result)?\.json$/i, ".glb")
      : fea && picture !== null
        ? `${folder}${baseName(picture)}`
        : path.replace(fea ? /\.json$/i : /\.result\.json$/i, ".glb"),
    part: baseName(text(data.document) ?? name.slice(0, name.indexOf("."))),
    check: fea
      ? (named ?? ANALYSIS_WORDS[analysis ?? "static"] ?? humanize(analysis ?? "simulation"))
      : humanize(analysis ?? name.split(".").at(-3) ?? "Check"),
    status,
    headline:
      (verdict === null ? null : text(verdict.headline)) ??
      issues[0]?.summary ??
      (fea && safety !== null
        ? `Holds the load, safety factor ${safety.toFixed(safety < 10 ? 1 : 0)}`
        : "Passed every check"),
    issues,
    ...(modifiedAt === undefined ? {} : { written: Date.parse(modifiedAt) / 1000 }),
  };
}

/**
 * A project's parts as its overview lists them: its models and boards, each
 * part once. A STEP or mesh exported beside a cadgen 0.8 model folds into the model,
 * a mesh exported beside its STEP folds into the STEP, and a STEP
 * exported beside its SolidCraft design folds into the design, which opens in
 * the part editor and is pictured by its STEP.
 */
export function overviewParts(files: ReadonlyArray<ProjectFile>): ProjectFile[] {
  const parts = files.filter((file) => file.group === "CAD" || file.group === "Electronics");
  const key = (file: ProjectFile) => `${file.folder}/${stemOf(file.name)}`;
  // A cadgen 0.8 model is the part; a STEP of its name beside it is that model exported.
  const modelled = new Set(parts.filter((file) => file.document !== undefined).map(key));
  const steps = new Map(
    parts.filter((file) => file.kind === "Part").map((file) => [key(file), file]),
  );
  const designs = new Set(parts.filter((file) => file.kind === "Design").map(key));
  return parts.flatMap((file) => {
    if (file.document === undefined && modelled.has(key(file))) return [];
    if (file.kind === "Mesh" && steps.has(key(file))) return [];
    if (file.kind === "Part" && designs.has(key(file))) return [];
    if (file.kind === "Design") {
      const step = steps.get(key(file));
      return [step === undefined ? file : { ...file, picture: step.path }];
    }
    return [file];
  });
}

/**
 * The results about this part: those naming its file, or, naming none, its
 * stem. A design's checks run on its STEP, so a design takes those naming its stem.
 */
export function resultsFor(part: ProjectFile, results: ReadonlyArray<CheckResult>): CheckResult[] {
  const name = part.name.toLowerCase();
  const stem = stemOf(part.name);
  return results.filter((result) => {
    // A result of cadgen 0.8 names a model's document by its id.
    if (part.document !== undefined && result.part === part.document) return true;
    const named = result.part.toLowerCase();
    if (part.kind === "Design") return stemOf(named) === stem;
    // A model's checks run on the STEP exported from it, named after its script.
    if (part.document !== undefined && /\.(step|stp)$/.test(named)) return stemOf(named) === stem;
    return named === name || (!named.includes(".") && named === stem);
  });
}

/**
 * Whether the part changed since this check: its last build is later than the result. A result
 * whose file names no time, or a part the engine has not built, says nothing, so neither marks it.
 */
export function checkOutOfDate(
  result: Pick<CheckResult, "written">,
  part: Pick<ProjectFile, "version">,
): boolean {
  return (
    result.written !== undefined &&
    part.version !== undefined &&
    result.written < Number(part.version)
  );
}

/**
 * The results among `results` still about their part as it is: a check written before the model it
 * checked was last built is of a version since changed, so it neither passes nor fails the part.
 */
export function currentResults(
  parts: ReadonlyArray<ProjectFile>,
  results: ReadonlyArray<CheckResult>,
): CheckResult[] {
  return results.filter(
    (result) =>
      !parts.some((part) => checkOutOfDate(result, part) && resultsFor(part, [result]).length > 0),
  );
}

/**
 * A part's drawing sheets, anywhere in its folder: the engineering drawing's
 * PDF, `bracket_drawing.pdf`, as its script names it.
 */
export function drawingsFor(part: ProjectFile, paths: ReadonlyArray<string>): string[] {
  const stem = stemOf(part.name);
  return paths.filter((path) => {
    const name = baseName(path).toLowerCase();
    return /[._-]drawing\.pdf$/.test(name) && name.slice(0, -"_drawing.pdf".length) === stem;
  });
}

/** How many folders two folder paths share from the top. */
function sharedFolders(a: string, b: string): number {
  const left = a.split("/").filter(Boolean);
  const right = b.split("/").filter(Boolean);
  let count = 0;
  while (count < left.length && left[count] === right[count]) count += 1;
  return count;
}

/**
 * What was made from each part in one group of files, by the part's path: those whose names begin
 * with the part's own. Each file is one part's: the one whose name it begins with most of, then
 * the one in the folder nearest it, so `bracket_v2.nc` is Bracket v2's, not Bracket's.
 */
function namedFor(
  parts: ReadonlyArray<ProjectFile>,
  files: ReadonlyArray<ProjectFile>,
  group: ProjectFile["group"],
): Map<string, ProjectFile[]> {
  const made = new Map<string, ProjectFile[]>();
  for (const file of files) {
    if (file.group !== group) continue;
    const name = file.name.toLowerCase();
    const owner = parts
      .filter((part) => {
        const stem = stemOf(part.name);
        return name.startsWith(stem) && /[._-]/.test(name.charAt(stem.length));
      })
      .toSorted(
        (a, b) =>
          stemOf(b.name).length - stemOf(a.name).length ||
          sharedFolders(b.folder, file.folder) - sharedFolders(a.folder, file.folder),
      )[0];
    if (owner !== undefined) made.set(owner.path, [...(made.get(owner.path) ?? []), file]);
  }
  return made;
}

/**
 * What was made to manufacture each part, by the part's path: the CAM jobs, G-code, Gerbers and
 * the like whose names begin with the part's own (`l_bracket.nc`, `servo_power.gerbers.zip`).
 */
export const manufacturingFor = (
  parts: ReadonlyArray<ProjectFile>,
  files: ReadonlyArray<ProjectFile>,
) => namedFor(parts, files, "Manufacturing");

/** Each part's study files, by the part's path: those whose names begin with its own. */
export const studiesFor = (parts: ReadonlyArray<ProjectFile>, files: ReadonlyArray<ProjectFile>) =>
  namedFor(parts, files, "Analysis");

/** The worst status among the results, or null when none has run. */
export function worstStatus(results: ReadonlyArray<CheckResult>): CheckStatus | null {
  return results.reduce<CheckStatus | null>(
    (worst, result) =>
      worst === null || STATUS_RANK[result.status] > STATUS_RANK[worst] ? result.status : worst,
    null,
  );
}

/**
 * What "Propose a fix" writes into the composer: the issue, the fix the check
 * suggests, and the ask to propose and wait. A failed check never changes the
 * part on its own; the engineer says go. `part` is how the ask names the part,
 * a link to its file where the overview knows it; else its file name.
 */
export function proposeFixPrompt(
  result: CheckResult,
  issue: CheckIssue,
  part: string = result.part,
): string {
  const check = result.check.toLowerCase();
  const suggestion = issue.fix === null ? "" : ` The check suggests: ${sentence(issue.fix)}.`;
  return (
    `The ${check} check on ${part} found: ${sentence(issue.summary)}.${suggestion} ` +
    `Propose a fix: ask me with the change you recommend first and what you expect it to give, and wait for my pick before changing the part.`
  );
}
