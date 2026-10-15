import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { engineeringTraitDescriptor } from "./engineeringTraits";

const reasoning: ProviderOptionDescriptor = {
  id: "reasoningEffort",
  label: "Reasoning",
  type: "select",
  options: [
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium", isDefault: true },
    { id: "high", label: "High" },
    { id: "xhigh", label: "Extra High" },
    { id: "max", label: "Max" },
    { id: "ultra", label: "Ultra" },
  ],
  currentValue: "medium",
};

const choices = (descriptor: ProviderOptionDescriptor) =>
  descriptor.type === "select"
    ? descriptor.options.map(({ id, label, isDefault }) => [id, label, isDefault ?? false])
    : [];

describe("engineering composer options", () => {
  it("reads reasoning as thinking, folding the levels past High into one Thorough", () => {
    const shown = engineeringTraitDescriptor(reasoning, "medium");
    expect(shown.label).toBe("Thinking");
    expect(choices(shown)).toEqual([
      ["low", "Quick", false],
      ["medium", "Normal", true],
      ["high", "Careful", false],
      ["ultra", "Thorough", false],
    ]);
  });

  it("lets Thorough stand for the level in use, so the pick stays visible", () => {
    expect(choices(engineeringTraitDescriptor(reasoning, "xhigh")).at(-1)).toEqual([
      "xhigh",
      "Thorough",
      false,
    ]);
  });

  it("keeps levels it has no plain word for under their own names", () => {
    const claude: ProviderOptionDescriptor = {
      id: "effort",
      label: "Reasoning",
      type: "select",
      options: [
        { id: "high", label: "High" },
        { id: "max", label: "Max" },
        { id: "ultrathink", label: "Ultrathink" },
      ],
    };
    expect(choices(engineeringTraitDescriptor(claude, null))).toEqual([
      ["high", "Careful", false],
      ["max", "Thorough", false],
      ["ultrathink", "Ultrathink", false],
    ]);
  });

  it("reads the service tier as speed, its note in plain words", () => {
    const shown = engineeringTraitDescriptor(
      {
        id: "serviceTier",
        label: "Service Tier",
        type: "select",
        options: [
          { id: "default", label: "Standard", isDefault: true },
          { id: "fast", label: "Fast", description: "2x speed, increased usage" },
        ],
        currentValue: "default",
      },
      "default",
    );
    expect(shown.label).toBe("Speed");
    expect(shown.type === "select" ? shown.options : []).toEqual([
      { id: "default", label: "Normal", isDefault: true },
      { id: "fast", label: "Fast", description: "Twice as fast, uses more of your plan" },
    ]);
  });

  it("passes other options through untouched", () => {
    const fastMode: ProviderOptionDescriptor = {
      id: "fastMode",
      label: "Fast Mode",
      type: "boolean",
    };
    expect(engineeringTraitDescriptor(fastMode, null)).toBe(fastMode);
  });
});
