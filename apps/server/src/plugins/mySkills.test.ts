// @effect-diagnostics nodeBuiltinImport:off -- fixtures are skill folders on disk.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { afterEach, describe, expect, it } from "@effect/vitest";

import { readPlugin } from "@t3tools/plugins";

import { nodeFolder } from "./pluginFiles.ts";
import {
  copySkill,
  createSkill,
  editedSkillText,
  ensureMySkills,
  readSkill,
  removeSkill,
  renamedSkillText,
  saveSkill,
  skillFolderIn,
  skillSlug,
} from "./mySkills.ts";
import { readSkillDetail } from "./skillDetails.ts";

const made: Array<string> = [];
const scratch = () => {
  const dir = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "my-skills-"));
  made.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of made.splice(0)) NodeFS.rmSync(dir, { recursive: true, force: true });
});

describe("the person's own skills", () => {
  it("are a plugin that lists what is added and forgets what is removed", () => {
    const root = scratch();
    ensureMySkills(root);
    const skills = NodePath.join(root, "skills");
    const name = createSkill(skills, "Check Wall Thickness!", 'For "thin" walls: 3D prints');
    expect(name).toBe("check-wall-thickness");
    expect(createSkill(skills, "Check wall thickness", "again")).toBe("check-wall-thickness-2");
    expect(readPlugin(nodeFolder(root)).skills).toEqual([name, `${name}-2`]);

    removeSkill(NodePath.join(skills, `${name}-2`));
    expect(readPlugin(nodeFolder(root)).skills).toEqual([name]);
  });

  it("keeps a title as it was typed, and out of the skill's files", () => {
    const skills = scratch();
    const name = createSkill(skills, "Audit test skill", "Checks the library");
    const folder = NodePath.join(skills, name);

    expect(name).toBe("audit-test-skill");
    expect(readSkillDetail(folder, name).displayName).toBe("Audit test skill");
    expect(readSkill(folder, null)?.files).toEqual([]);
  });

  it("reads a skill and its files, and saves what is written", () => {
    const skills = scratch();
    const folder = NodePath.join(skills, createSkill(skills, "Notes", "n"));
    NodeFS.mkdirSync(NodePath.join(folder, "references"));
    NodeFS.writeFileSync(NodePath.join(folder, "references", "a.md"), "more");

    saveSkill(folder, { title: "Notes", description: "n", instructions: "changed" });
    expect(readSkill(folder, null)).toEqual({
      text: "---\nname: notes\ndescription: n\n---\n\nchanged\n",
      description: "n",
      files: ["references/a.md"],
    });
    expect(readSkill(folder, "references/a.md")?.text).toBe("more");
    expect(readSkill(folder, "../other.md")).toBeNull();
    expect(readSkill(NodePath.join(skills, "nothing"), null)).toBeNull();
  });

  it("saves a name, what it is for and the steps, keeping the rest of the header", () => {
    const skills = scratch();
    const folder = NodePath.join(skills, "my-cad");
    NodeFS.mkdirSync(NodePath.join(folder, "agents"), { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(folder, "SKILL.md"),
      "---\nname: my-cad\nlicense: MIT\ndescription: >\n  Long\n  words\n---\n\n# Old\n",
    );
    NodeFS.writeFileSync(
      NodePath.join(folder, "agents", "openai.yaml"),
      'interface:\n  display_name: "CAD (my copy)"\n  short_description: "Old"\n',
    );

    saveSkill(folder, {
      title: "Our CAD: house rules",
      description: "Parts the way we make them",
      instructions: "# New\n\nSteps\n",
    });

    expect(readSkill(folder, null)?.text).toBe(
      "---\nname: my-cad\nlicense: MIT\ndescription: Parts the way we make them\n---\n\n# New\n\nSteps\n",
    );
    expect(readSkillDetail(folder, "my-cad")).toMatchObject({
      displayName: "Our CAD: house rules",
      description: "Parts the way we make them",
    });
  });

  it("keeps a copy's short description when only its name changes", () => {
    const skills = scratch();
    const folder = NodePath.join(skills, "my-cad");
    NodeFS.mkdirSync(NodePath.join(folder, "agents"), { recursive: true });
    NodeFS.writeFileSync(
      NodePath.join(folder, "SKILL.md"),
      "---\nname: my-cad\ndescription: The long words the agent matches on\n---\n\n# Steps\n",
    );
    NodeFS.writeFileSync(
      NodePath.join(folder, "agents", "openai.yaml"),
      'interface:\n  display_name: "CAD (my copy)"\n  short_description: "Make parts"\n',
    );

    saveSkill(folder, {
      title: "Our CAD",
      description: "The long words the agent matches on",
      instructions: "# Steps\n",
    });

    expect(readSkillDetail(folder, "my-cad")).toMatchObject({
      displayName: "Our CAD",
      description: "Make parts",
    });
    expect(readSkill(folder, null)?.description).toBe("The long words the agent matches on");
  });

  it("gives a skill with no header one that names it", () => {
    expect(editedSkillText("# Just steps\n", "notes", "n: for notes", "Steps")).toBe(
      '---\nname: notes\ndescription: "n: for notes"\n---\n\nSteps\n',
    );
  });

  it("copies a plugin's skill whole, leaving the plugin's as it shipped", () => {
    const skills = scratch();
    const from = NodePath.join(scratch(), "cad");
    NodeFS.mkdirSync(NodePath.join(from, "agents"), { recursive: true });
    const original = "---\nname: cad\ndescription: Parts\n---\n\n# CAD\n";
    NodeFS.writeFileSync(NodePath.join(from, "SKILL.md"), original);
    NodeFS.writeFileSync(
      NodePath.join(from, "agents", "openai.yaml"),
      'interface:\n  display_name: "CAD"\n',
    );

    expect(copySkill(from, skills, "cad")).toBe("my-cad");
    expect(copySkill(from, skills, "cad")).toBe("my-cad-2");
    expect(readSkill(NodePath.join(skills, "my-cad"), null)?.text).toContain("name: my-cad\n");
    expect(
      NodeFS.readFileSync(NodePath.join(skills, "my-cad", "agents", "openai.yaml"), "utf8"),
    ).toContain('display_name: "CAD (my copy)"');
    expect(NodeFS.readFileSync(NodePath.join(from, "SKILL.md"), "utf8")).toBe(original);
  });

  it("keeps a name inside the skills folder", () => {
    expect(skillFolderIn("/s", "cad")).toBe(NodePath.join("/s", "cad"));
    for (const name of ["", "..", "a/b", "a\\b"]) expect(skillFolderIn("/s", name)).toBeNull();
  });

  it("names a skill from any title", () => {
    expect(skillSlug("  ?? ")).toBe("skill");
    expect(renamedSkillText("---\nname: a\n---\nname: body\n", "b")).toBe(
      "---\nname: b\n---\nname: body\n",
    );
  });
});
