import type { ProjectFile } from "./projectFiles";

/**
 * The checks a project's parts have been through, read from the results the
 * text-to-cad plugin writes beside each part: an FEA study's `<name>.fea.json`
 * and a manufacturing check's `<stem>.<process>.result.json`, each beside the
 * model of its result (`.glb`) that the viewer opens. A result holds its
 * findings (`check`, `severity` error, warning or info, `summary`, and a
 * `fix` with its own `summary` when the check names one) and, from newer
 * versions, a verdict (`status` ready or fix, a `headline`, counts).
 */

/** The processes `cadgen manufacturing check` simulates, as a study and its result name them. */
export const MANUFACTURING_PROCESSES = [
  "casting",
  "molding",
  "heat_treatment",
  "machining",
  "printing",
  "welding",
  "sheet_metal",
] as const;

const RESULT_FILE = /\.(?:fea\.json|result\.json)$/i;

/** Whether the file is a check's result the overview reads. */
export const isCheckResultPath = (path: string) => RESULT_FILE.test(path);

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
  /** What was checked, in a word or two: "FEA", "Casting", "Heat treatment". */
  readonly check: string;
  readonly status: CheckStatus;
  /** The verdict in a line: "1 to fix · shrinkage hot spot", "Ready to cast". */
  readonly headline: string;
  /** Errors first, then warnings. */
  readonly issues: ReadonlyArray<CheckIssue>;
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
export function parseCheckResult(path: string, contents: string): CheckResult | null {
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

  const fea = /\.fea\.json$/i.test(path);
  const analysis = text(data.analysis);
  const name = baseName(path);
  return {
    path,
    model: path.replace(fea ? /\.json$/i : /\.result\.json$/i, ".glb"),
    part: baseName(text(data.document) ?? name.slice(0, name.indexOf("."))),
    check: fea ? "FEA" : humanize(analysis ?? name.split(".").at(-3) ?? "Check"),
    status,
    headline:
      (verdict === null ? null : text(verdict.headline)) ??
      issues[0]?.summary ??
      "Passed every check",
    issues,
  };
}

/**
 * A project's parts as its overview lists them: its models and boards, a mesh
 * exported beside its STEP folded into it, so each part appears once.
 */
export function overviewParts(files: ReadonlyArray<ProjectFile>): ProjectFile[] {
  const parts = files.filter(
    (file) => file.group === "Models" || file.group === "Boards and wiring",
  );
  const steps = new Set(
    parts
      .filter((file) => file.kind === "STEP")
      .map((file) => `${file.folder}/${stemOf(file.name)}`),
  );
  return parts.filter(
    (file) => file.kind !== "Mesh" || !steps.has(`${file.folder}/${stemOf(file.name)}`),
  );
}

/** The results about this part: those naming its file, or, naming none, its stem. */
export function resultsFor(part: ProjectFile, results: ReadonlyArray<CheckResult>): CheckResult[] {
  const name = part.name.toLowerCase();
  const stem = stemOf(part.name);
  return results.filter((result) => {
    const named = result.part.toLowerCase();
    return named === name || (!named.includes(".") && named === stem);
  });
}

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
 * part on its own; the engineer says go.
 */
export function proposeFixPrompt(result: CheckResult, issue: CheckIssue): string {
  const check = result.check === "FEA" ? "FEA" : result.check.toLowerCase();
  const suggestion = issue.fix === null ? "" : ` The check suggests: ${sentence(issue.fix)}.`;
  return (
    `The ${check} check on ${result.part} found: ${sentence(issue.summary)}.${suggestion} ` +
    `Propose a fix: say what you would change and why, then wait for my go before changing the part.`
  );
}
