// @effect-diagnostics nodeBuiltinImport:off -- fixtures are skill folders on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";

import { readSkillDetail } from "./skillDetails.ts";

const made: Array<string> = [];
afterEach(() => {
  for (const dir of made.splice(0)) NodeFS.rmSync(dir, { recursive: true, force: true });
});

/** A skill folder holding these files, each named by its path inside the folder. */
function skillFolder(files: Readonly<Record<string, string>>) {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-skill-details-"));
  made.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const file = NodePath.join(dir, relative);
    NodeFS.mkdirSync(NodePath.dirname(file), { recursive: true });
    NodeFS.writeFileSync(file, contents);
  }
  return dir;
}

/** An `agents/openai.yaml` whose `interface` holds these keys; each value is YAML as written. */
const openaiYaml = (face: Readonly<Record<string, string>>) => {
  const lines = Object.entries(face).map(([key, value]) => `  ${key}: ${value}`);
  return ["interface:", ...lines, ""].join("\n");
};

describe("readSkillDetail", () => {
  it("reads the description from openai.yaml, then SKILL.md", () => {
    const folder = skillFolder({
      "SKILL.md": "---\nname: fea\ndescription: Run studies. Use when asked.\n---\n\n# FEA\n",
      "agents/openai.yaml": openaiYaml({
        display_name: '"FEA"',
        short_description: '"Simulate parts."',
        default_prompt: '"Use $fea on the bracket."',
      }),
    });
    expect(readSkillDetail(folder, "fea")).toEqual({
      name: "fea",
      displayName: "FEA",
      description: "Simulate parts.",
      defaultPrompt: "Use $fea on the bracket.",
    });
  });

  it("falls back to SKILL.md's description without openai.yaml", () => {
    const folder = skillFolder({
      "SKILL.md": "---\nname: fea\ndescription: Run studies. Use when asked.\n---\n\n# FEA\n",
    });
    expect(readSkillDetail(folder, "fea")).toEqual({
      name: "fea",
      displayName: null,
      description: "Run studies. Use when asked.",
      defaultPrompt: null,
    });
  });

  it("never throws on a broken file", () => {
    const folder = skillFolder({
      "SKILL.md": "# FEA\n\nNo front matter in this one.\n",
      "agents/openai.yaml": ": : :\n",
    });
    expect(readSkillDetail(folder, "fea")).toEqual({
      name: "fea",
      displayName: null,
      description: "",
      defaultPrompt: null,
    });
  });

  it("keeps what one file says when the other is broken", () => {
    const brokenAgent = skillFolder({
      "SKILL.md": "---\nname: fea\ndescription: Run studies.\n---\n",
      "agents/openai.yaml": ": : :\n",
    });
    expect(readSkillDetail(brokenAgent, "fea")).toEqual({
      name: "fea",
      displayName: null,
      description: "Run studies.",
      defaultPrompt: null,
    });

    const brokenSkill = skillFolder({
      "SKILL.md": "---\ndescription: : : :\n---\n",
      "agents/openai.yaml": openaiYaml({ display_name: '"FEA"', default_prompt: '"Use $fea."' }),
    });
    expect(readSkillDetail(brokenSkill, "fea")).toEqual({
      name: "fea",
      displayName: "FEA",
      description: "",
      defaultPrompt: "Use $fea.",
    });
  });

  it("clips long text", () => {
    const long = "x".repeat(600);
    const fromSkill = readSkillDetail(
      skillFolder({ "SKILL.md": `---\ndescription: ${long}\n---\n` }),
      "fea",
    );
    expect(fromSkill.description.length).toBe(400);

    // Each field is cut to the length PluginSkillDetail allows it.
    const fromAgent = readSkillDetail(
      skillFolder({
        "agents/openai.yaml": openaiYaml({
          display_name: long,
          short_description: long,
          default_prompt: long,
        }),
      }),
      "fea",
    );
    expect(fromAgent.displayName?.length).toBe(160);
    expect(fromAgent.description.length).toBe(400);
    expect(fromAgent.defaultPrompt?.length).toBe(300);
  });
});
