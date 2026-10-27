import { ProviderInstanceId, type ModelSelection } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { defaultModelToApply, takeDefaultModelChange } from "./defaultModelFollow";

const pick = (model: string, options?: ModelSelection["options"]): ModelSelection => ({
  instanceId: ProviderInstanceId.make("codex"),
  model,
  ...(options ? { options } : {}),
});

describe("the open chat following the default model", () => {
  it("applies a default that changed since the chat last looked", () => {
    expect(defaultModelToApply({ engineering: true, current: pick("b"), seen: pick("a") })).toEqual(
      pick("b"),
    );
    expect(defaultModelToApply({ engineering: true, current: pick("a"), seen: null })).toEqual(
      pick("a"),
    );
  });

  it("applies a change of Thinking or Speed alone", () => {
    const high = pick("a", [{ id: "effort", value: "high" }] as never);
    expect(defaultModelToApply({ engineering: true, current: high, seen: pick("a") })).toEqual(
      high,
    );
  });

  it("does nothing for the same default, a first look, a reset to Automatic, or the code interfaces", () => {
    expect(defaultModelToApply({ engineering: true, current: pick("a"), seen: pick("a") })).toBe(
      null,
    );
    expect(defaultModelToApply({ engineering: true, current: pick("a"), seen: undefined })).toBe(
      null,
    );
    expect(defaultModelToApply({ engineering: true, current: null, seen: pick("a") })).toBe(null);
    expect(defaultModelToApply({ engineering: false, current: pick("b"), seen: pick("a") })).toBe(
      null,
    );
  });

  it("remembers per project, so a change is applied once", () => {
    expect(takeDefaultModelChange("p1", true, pick("a"))).toBe(null);
    expect(takeDefaultModelChange("p1", true, pick("b"))).toEqual(pick("b"));
    expect(takeDefaultModelChange("p1", true, pick("b"))).toBe(null);
    expect(takeDefaultModelChange("p2", true, pick("b"))).toBe(null);
  });
});
