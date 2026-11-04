// @effect-diagnostics nodeBuiltinImport:off - reads the repository's own files.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import { assert, it } from "@effect/vitest";

// The shape of Studio's laws (AGENTS.md): each one is numbered in order, says what holds it, and
// what it names exists. A law that points at a rule or a test nobody runs holds nothing.
const ROOT = NodePath.join(import.meta.dirname, "..");
const read = (path: string) => NodeFS.readFileSync(NodePath.join(ROOT, path), "utf8");

interface Law {
  readonly number: number;
  readonly text: string;
}

function studioLaws(): ReadonlyArray<Law> {
  const section =
    read("AGENTS.md")
      .split("## Studio's laws")[1]
      ?.split(/\n#{1,2} /u)[0] ?? "";
  return section
    .split(/\n(?=\d+\. )/u)
    .filter((block) => /^\d+\. /u.test(block))
    .map((block) => ({ number: Number(block.split(".")[0]), text: block }));
}

it("numbers Studio's laws in order and says what holds each one", () => {
  const laws = studioLaws();
  assert.isAtLeast(laws.length, 12);
  laws.forEach((law, index) => {
    assert.equal(law.number, index + 1, `law ${law.number} is out of order`);
    assert.match(
      law.text,
      /_(?:Lint|Tests?|Review|The submodule)\b[^_]*_\s*$/u,
      `law ${law.number} does not end by saying what holds it`,
    );
  });
});

it("names only lint rules that exist and are switched on, and files that exist", () => {
  const plugin = read("oxlint-plugin-t3code/index.ts");
  const config = read("vite.config.ts");
  for (const law of studioLaws()) {
    const holder =
      /_((?:Lint|Tests?|Review|The submodule)\b[\s\S]*)_\s*$/u.exec(law.text)?.[1] ?? "";
    for (const [, rule] of holder.matchAll(/`t3code\/([a-z-]+)`/gu)) {
      assert.include(
        plugin,
        `"${rule}":`,
        `law ${law.number}: t3code/${rule} is not in the plugin`,
      );
      assert.match(
        config,
        new RegExp(`"t3code/${rule}": "error"`, "u"),
        `law ${law.number}: t3code/${rule} is not switched on`,
      );
    }
    for (const [, rule] of holder.matchAll(/`(shadcn\/[a-z-]+)`/gu)) {
      assert.include(config, `"${rule}": "error"`, `law ${law.number}: ${rule} is not switched on`);
    }
    for (const [, path = ""] of holder.matchAll(/`([\w./-]+\.(?:ts|tsx|yml))`/gu)) {
      assert.isTrue(
        NodeFS.existsSync(NodePath.join(ROOT, path)),
        `law ${law.number}: ${path} does not exist (name files by their path from the repository root)`,
      );
    }
  }
});
