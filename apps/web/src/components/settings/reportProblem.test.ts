import { describe, expect, it } from "vite-plus/test";

import { reportProblemUrl, STUDIO_NEW_ISSUE_URL } from "./reportProblem";

const bodyOf = (url: string) => {
  const parsed = new URL(url);
  expect(`${parsed.origin}${parsed.pathname}`).toBe(STUDIO_NEW_ISSUE_URL);
  return parsed.searchParams.get("body");
};

describe("reportProblemUrl", () => {
  it("fills in the version, the machine and the usage id", () => {
    const body = bodyOf(
      reportProblemUrl({
        appName: "Studio",
        version: "0.1.5",
        platform: { os: "darwin", arch: "arm64" },
        usageId: "abc123",
      }),
    );
    expect(body?.endsWith("---\nStudio 0.1.5\nMachine: macOS (arm64)\nUsage ID: abc123")).toBe(
      true,
    );
  });

  it("leaves the usage id out when this machine sends no counts", () => {
    const body = bodyOf(
      reportProblemUrl({
        appName: "Studio",
        version: "0.1.5",
        platform: { os: "windows", arch: "other" },
        usageId: null,
      }),
    );
    expect(body?.endsWith("Machine: Windows")).toBe(true);
    expect(body).not.toContain("Usage ID");
  });
});
