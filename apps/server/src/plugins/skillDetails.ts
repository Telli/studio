// @effect-diagnostics nodeBuiltinImport:off -- a skill is a folder of files, read synchronously like the rest of the plugin files.
/**
 * What an installed skill says about itself, for lists of skills. Codex's
 * `agents/openai.yaml` gives a display name (`interface.display_name`), a
 * one-line description (`short_description`) and an ask that shows the skill off
 * (`default_prompt`); the description in `SKILL.md`'s front matter stands in
 * when openai.yaml has none. Each file is read on its own, so one that is
 * missing or broken costs only what it would have said.
 */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { PluginSkillDetail } from "@t3tools/contracts";
import { clip, isRecord } from "@t3tools/plugins";
import { parse as parseYaml } from "yaml";

/** The text between a SKILL.md's first two `---` lines. */
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/** A file's text, or "" when it cannot be read. */
function readText(file: string): string {
  try {
    return NodeFS.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** The map a YAML text holds; `{}` when it is empty, does not parse, or holds anything else. */
function parseMap(yaml: string): Record<string, unknown> {
  try {
    const parsed: unknown = parseYaml(yaml);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** A string trimmed and cut to `max`; null when `value` is not one or is blank. */
function textOf(value: unknown, max: number): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : clip(trimmed, max);
}

/**
 * The details of the skill in `skillFolder` (`<skills dir>/<name>`), which its
 * plugin lists as `name`. Never throws: a skill with nothing readable is
 * described by its name alone.
 */
export function readSkillDetail(skillFolder: string, name: string): PluginSkillDetail {
  const skill = parseMap(
    FRONT_MATTER.exec(readText(NodePath.join(skillFolder, "SKILL.md")))?.[1] ?? "",
  );
  const agent = parseMap(readText(NodePath.join(skillFolder, "agents", "openai.yaml")));
  const face = isRecord(agent.interface) ? agent.interface : {};
  return {
    name: clip(name, 128),
    displayName: textOf(face.display_name, 160),
    description: textOf(face.short_description, 400) ?? textOf(skill.description, 400) ?? "",
    defaultPrompt: textOf(face.default_prompt, 300),
  };
}
