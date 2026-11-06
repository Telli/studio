import type { OrchestrationV2ProviderFailureClass, RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { offersTryAgain, plainFailure, TRY_AGAIN_PROMPT } from "./plainFailure";

const CLASSES: ReadonlyArray<OrchestrationV2ProviderFailureClass> = [
  "usage_limit",
  "provider_error",
  "transport_error",
  "permission_error",
  "validation_error",
  "unknown",
];

const run = "run-2" as RunId;

describe("plainFailure", () => {
  it("names no provider, server or T3 for any class", () => {
    for (const failureClass of CLASSES) {
      const { label, detail } = plainFailure(failureClass);
      expect(`${label} ${detail}`).not.toMatch(/provider|server|t3/i);
    }
  });

  it("never says Try again for a usage limit", () => {
    const { label, detail } = plainFailure("usage_limit");
    expect(`${label} ${detail}`).not.toMatch(/try again|retry/i);
  });
});

describe("offersTryAgain", () => {
  const latest = { failureClass: "provider_error", runId: run, latestFailedRunId: run } as const;

  it("offers it on the latest failed run", () => {
    expect(offersTryAgain(latest)).toBe(true);
  });

  it("not on an earlier run, one with no run, or when no failed run is the latest", () => {
    expect(offersTryAgain({ ...latest, runId: "run-1" as RunId })).toBe(false);
    expect(offersTryAgain({ ...latest, runId: null, latestFailedRunId: null })).toBe(false);
    expect(offersTryAgain({ ...latest, latestFailedRunId: null })).toBe(false);
  });

  it("never on a usage limit", () => {
    expect(offersTryAgain({ ...latest, failureClass: "usage_limit" })).toBe(false);
  });

  it("asks the agent to carry on, not to start over", () => {
    expect(TRY_AGAIN_PROMPT).toMatch(/^Continue from your last step/);
  });
});
