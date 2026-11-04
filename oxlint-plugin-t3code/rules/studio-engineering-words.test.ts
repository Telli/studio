import { assert, describe } from "@effect/vitest";

import { createOxlintRuleHarness } from "../test/utils.ts";

const rule = createOxlintRuleHarness("t3code/studio-engineering-words", {
  filename: "fixture.tsx",
});

describe("t3code/studio-engineering-words", () => {
  rule.valid(
    "allows engineering words",
    `const el = <p title="Sync this project">Every change is a version you can go back to.</p>;`,
  );

  rule.valid(
    "allows git words in code that no one reads",
    `const sent = push.run({ action: "commit_push" }); results.push(scan); if (/not a git repository/i.test(error)) {}`,
  );

  rule.valid(
    "allows git words in a class name, a key or a condition",
    `const el = <Row key="branch" className="push-left" data-kind="repo">{kind === "commit" ? "Version" : "File"}</Row>;`,
  );

  rule.invalid(
    "reports a git word in text",
    `const el = <p>Every change is a commit.</p>;`,
    (output) => {
      assert.match(output, /"commit" is a git word/);
    },
  );

  rule.invalid(
    "reports a git word in a branch of shown text",
    `const el = <p>{git ? " and its own git repository" : "."}</p>;`,
  );

  rule.invalid(
    "reports a git word in a text prop",
    "const el = <Choice description={`A private repository on ${account}`} />;",
  );

  rule.invalid(
    "reports a git word in a toast",
    `toastManager.add({ type: "error", title: "Could not push the branch" });`,
  );

  rule.invalid(
    "reports a git word in an error a person sees",
    `throw new Error("GitHub would not make the repository.");`,
  );
});
