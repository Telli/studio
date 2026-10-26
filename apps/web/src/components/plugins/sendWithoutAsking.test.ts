import { describe, expect, it } from "vite-plus/test";

import { sendsWithoutAsking } from "./sendWithoutAsking";

const press = { studio: true, pluginId: "text-to-cad", focused: true, activated: true };

describe("sendsWithoutAsking", () => {
  it("sends Studio's own viewer's note at its press", () => {
    expect(sendsWithoutAsking(press)).toBe(true);
  });
  it("asks for any other plugin", () => {
    expect(sendsWithoutAsking({ ...press, pluginId: "figma" })).toBe(false);
  });
  it("asks without a press, or with the view not in focus", () => {
    expect(sendsWithoutAsking({ ...press, activated: false })).toBe(false);
    expect(sendsWithoutAsking({ ...press, focused: false })).toBe(false);
  });
  it("asks outside Studio", () => {
    expect(sendsWithoutAsking({ ...press, studio: false })).toBe(false);
  });
});
