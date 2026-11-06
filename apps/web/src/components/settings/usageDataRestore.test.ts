import { describe, expect, it } from "vite-plus/test";

import { usageDataRestorePatch } from "./usageDataRestore";

/** The server sends only on a yes: sharing on, and the question answered. */
const sending = (settings: { shareUsageData: boolean; usageDataAnswered: boolean }) =>
  settings.shareUsageData && settings.usageDataAnswered;

describe("usageDataRestorePatch", () => {
  it("asks a no again and does not turn sharing on", () => {
    const no = { shareUsageData: false, usageDataAnswered: true };
    const restored = { ...no, ...usageDataRestorePatch(no) };
    expect(restored).toEqual({ shareUsageData: true, usageDataAnswered: false });
    expect(sending(restored)).toBe(false);
  });

  it("leaves a yes as it is", () => {
    const yes = { shareUsageData: true, usageDataAnswered: true };
    expect(usageDataRestorePatch(yes)).toEqual({});
  });
});
