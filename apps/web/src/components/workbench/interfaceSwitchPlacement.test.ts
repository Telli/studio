import { describe, expect, it } from "vite-plus/test";

import { interfaceSwitchPlacement } from "./studioInterface";

describe("where the Interface switch is listed", () => {
  it("is a row of Appearance in the code interfaces", () => {
    expect(interfaceSwitchPlacement(false, true)).toBe("appearance");
  });

  it("is a page under Advanced in the engineering interface, not a row of Appearance", () => {
    expect(interfaceSwitchPlacement(true, true)).toBe("advanced");
  });

  it("is nowhere where Studio offers no choice", () => {
    expect(interfaceSwitchPlacement(true, false)).toBeNull();
    expect(interfaceSwitchPlacement(false, false)).toBeNull();
  });
});
