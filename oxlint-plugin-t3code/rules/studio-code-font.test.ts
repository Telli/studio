import { assert, describe } from "@effect/vitest";

import { createOxlintRuleHarness } from "../test/utils.ts";

const rule = createOxlintRuleHarness("t3code/studio-code-font", {
  filename: "fixture.tsx",
});

describe("t3code/studio-code-font", () => {
  rule.valid("allows sans-serif text", `const el = <p className="text-xs">Thickness</p>;`);

  rule.valid(
    "allows monospace on code",
    `const el = <pre className={cn("overflow-auto font-mono text-xs", wide && "w-full")}>{script}</pre>;`,
  );

  rule.valid(
    "allows monospace on inline code",
    `const el = <code className="font-mono">cad</code>;`,
  );

  rule.invalid(
    "reports monospace on text",
    `const el = <span className="font-mono text-xs">4 mm</span>;`,
    (output) => {
      assert.match(output, /Monospace is only for code/);
    },
  );

  rule.invalid(
    "reports monospace inside a class composition",
    `const el = <Badge className={cn("text-xs", tabular && "font-mono")}>12</Badge>;`,
  );
});
