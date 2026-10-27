import { describe, expect, it } from "vite-plus/test";

import { cardPlace, TOUR_STEPS } from "./tourSteps";

const card = { width: 320, height: 160 };
const window = { width: 1200, height: 800 };

describe("tour", () => {
  it("has five steps, each pointing somewhere, the last at the Toolbox", () => {
    expect(TOUR_STEPS).toHaveLength(5);
    expect(TOUR_STEPS.at(-1)?.target).toBe("[data-studio-toolbox]");
    expect(TOUR_STEPS.every((step) => step.target !== "" && !step.body.includes("—"))).toBe(true);
  });

  it("puts a card under what it points at, or above when there is no room", () => {
    expect(cardPlace({ top: 40, left: 100, width: 200, height: 40 }, card, window)).toEqual({
      top: 92,
      left: 100,
    });
    expect(cardPlace({ top: 700, left: 100, width: 200, height: 40 }, card, window)).toEqual({
      top: 528,
      left: 100,
    });
  });

  it("keeps a card inside the window, and centers it with nothing to point at", () => {
    expect(cardPlace({ top: 40, left: 1100, width: 80, height: 30 }, card, window).left).toBe(864);
    expect(cardPlace(null, card, window)).toEqual({ top: 320, left: 440 });
  });
});
