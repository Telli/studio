import type { ExecutionEnvironmentPlatform } from "@t3tools/contracts";

/** Where a problem report goes: Studio's own issues, not T3 Code's. */
export const STUDIO_NEW_ISSUE_URL = "https://github.com/amywork777/studio/issues/new";

const OS_NAMES = { darwin: "macOS", windows: "Windows", linux: "Linux", unknown: "Unknown OS" };

/**
 * A new issue on Studio's tracker with what a fix needs already filled in: the version, the
 * text-to-cad it includes where it names one, the machine, and the usage id when this machine
 * sends counts, so its counts can be found.
 */
export function reportProblemUrl(input: {
  readonly appName: string;
  readonly version: string;
  readonly textToCadVersion: string | null;
  readonly platform: Pick<ExecutionEnvironmentPlatform, "os" | "arch"> | null;
  readonly usageId: string | null;
}): string {
  const machine =
    input.platform === null
      ? "Unknown"
      : `${OS_NAMES[input.platform.os]}${input.platform.arch === "other" ? "" : ` (${input.platform.arch})`}`;
  const body = [
    "**What happened**",
    "",
    "",
    "**What you expected**",
    "",
    "",
    "---",
    `${input.appName} ${input.version}`,
    ...(input.textToCadVersion === null ? [] : [`text-to-cad: ${input.textToCadVersion}`]),
    `Machine: ${machine}`,
    ...(input.usageId === null ? [] : [`Usage ID: ${input.usageId}`]),
  ].join("\n");
  return `${STUDIO_NEW_ISSUE_URL}?${new URLSearchParams({ body }).toString()}`;
}
