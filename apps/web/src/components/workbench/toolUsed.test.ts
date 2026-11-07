import { describe, expect, it } from "vite-plus/test";

import { toolUsed, withToolLine } from "./toolUsed";

describe("the tool a chat message came from", () => {
  it("reads back the tool and the job", () => {
    expect(toolUsed(withToolLine("Engineering drawing", "Draw bracket.step."))).toEqual({
      tool: "Engineering drawing",
      message: "Draw bracket.step.",
    });
  });

  it("leaves a typed message alone", () => {
    expect(toolUsed("Draw bracket.step.")).toBeNull();
    expect(toolUsed("Please use the Tool: drawing one")).toBeNull();
    expect(toolUsed("Tool: nothing after it")).toBeNull();
  });
});
