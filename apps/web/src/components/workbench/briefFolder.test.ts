import { describe, expect, it } from "vite-plus/test";

import { setupRequest } from "./briefFolder";

describe("setup requests", () => {
  it("asks the agent for one change in plain words", () => {
    expect(setupRequest("material", "PETG")).toBe("Change the project's material to PETG.");
    expect(setupRequest("units", "in")).toBe("Change the project's units to inches.");
    expect(setupRequest("quantity", "20")).toBe("Change the project's quantity to 20.");
    expect(setupRequest("material", "")).toBe("Clear the project's material.");
  });
});
