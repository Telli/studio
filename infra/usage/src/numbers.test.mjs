import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { reportOf } from "../numbers.mjs";

NodeTest.test("reports each day's installs with its events under it", () => {
  const report = reportOf(
    [
      { day: "2026-11-06", installs: 2 },
      { day: "2026-11-05", installs: 1 },
    ],
    [
      { day: "2026-11-06", event: "client.connected", times: 39, installs: 2 },
      { day: "2026-11-05", event: "cad.hand_edit", times: 7, installs: 1 },
    ],
  );
  NodeAssert.equal(
    report,
    [
      "2026-11-06  2 installs",
      "      39  client.connected (2)",
      "2026-11-05  1 install",
      "       7  cad.hand_edit (1)",
    ].join("\n"),
  );
});

NodeTest.test("says so when there is nothing", () => {
  NodeAssert.equal(reportOf([], []), "No usage counts in this period.");
});
