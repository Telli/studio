import { assert, it } from "@effect/vitest";

import { cadTelemetryCommand, keptChoice } from "./CadToolsUsage.ts";

it("reads the choice the CAD tools keep, and none from a missing or broken file", () => {
  assert.strictEqual(keptChoice(JSON.stringify({ telemetry: { choice: "on", id: "x" } })), "on");
  assert.strictEqual(keptChoice(JSON.stringify({ telemetry: { choice: "off" } })), "off");
  assert.strictEqual(keptChoice(JSON.stringify({ language: { locale: "en" } })), null);
  assert.strictEqual(keptChoice("{not json"), null);
  assert.strictEqual(keptChoice(null), null);
});

it("turns the CAD tools on and off only when they differ from Studio", () => {
  assert.strictEqual(cadTelemetryCommand(true, null), "on");
  assert.strictEqual(cadTelemetryCommand(true, "off"), "on");
  assert.strictEqual(cadTelemetryCommand(true, "on"), null);
  // Off deletes what was sent, so it runs only where the CAD tools were sharing.
  assert.strictEqual(cadTelemetryCommand(false, "on"), "off");
  assert.strictEqual(cadTelemetryCommand(false, "off"), null);
  assert.strictEqual(cadTelemetryCommand(false, null), null);
});
