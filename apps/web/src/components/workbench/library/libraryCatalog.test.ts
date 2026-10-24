// @effect-diagnostics nodeBuiltinImport:off - checks the sample project's files and text-to-cad's skill folders on disk.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

import type { InstalledPlugin, PluginSkillDetail } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { HARDWARE_ACTIONS } from "../hardwareActions";
import { DOCUMENT_TEMPLATES, NEW_TEMPLATES, type NewTemplate } from "../newTemplates";
import {
  availability,
  entryOfAction,
  entryOfTemplate,
  findItIn,
  LIBRARY_DOCUMENTS,
  librarySkills,
  madeBy,
  makeOneTemplate,
  ownTemplateEntries,
  showsUpAs,
  skillName,
  UNLISTED_TEMPLATES,
} from "./libraryCatalog";
import libraryExamples from "./libraryExamples.json";

const ROOT = NodePath.join(import.meta.dirname, "..", "..", "..", "..", "..", "..");
const SAMPLE = NodePath.join(ROOT, "studio-sample", "servo-bracket");
const SKILLS = NodePath.join(ROOT, "text-to-cad", "skills");

/** text-to-cad's skills: the folders of its skills/ that hold a SKILL.md. */
const TEXT_TO_CAD_SKILLS = NodeFS.readdirSync(SKILLS)
  .filter((name) => NodeFS.existsSync(NodePath.join(SKILLS, name, "SKILL.md")))
  .toSorted();

/** The sample's outputs that could not be made, so their entries show no example. */
const NOT_MADE = [
  "doc:board",
  "doc:print",
  "skill:text-to-cad/bambu-labs",
  "skill:text-to-cad/gcode",
  "skill:text-to-cad/pcb",
  "skill:text-to-cad/pcb-dfm",
];

const EXAMPLES: Readonly<Record<string, { example: string; picture: string } | null>> =
  libraryExamples;

const doc = (id: string) => LIBRARY_DOCUMENTS.find((entry) => entry.id === id)!;

const detail = (name: string, defaultPrompt: string | null = null): PluginSkillDetail => ({
  name,
  displayName: null,
  description: `What ${name} does.`,
  defaultPrompt,
});

const plugin = (
  id: string,
  enabled: boolean,
  details: ReadonlyArray<PluginSkillDetail>,
): InstalledPlugin => ({
  id,
  displayName: `The ${id} plugin`,
  description: "",
  version: null,
  publisher: null,
  enabled,
  marketplace: null,
  commit: null,
  skills: details.map((entry) => entry.name),
  skillDetails: details,
  servers: [],
  views: [],
  compatibility: { level: "works", label: "Works", notes: [] },
  updateAvailable: false,
  error: null,
});

const textToCad = (enabled: boolean, defaultPrompt: string | null = null) =>
  plugin(
    "text-to-cad",
    enabled,
    TEXT_TO_CAD_SKILLS.map((name) => detail(name, defaultPrompt)),
  );

/** One of the person's own templates, as `documentTemplates.ts`'s `fileTemplate` makes it. */
const fileTemplate: NewTemplate = {
  id: "file:/p/Templates/Supplier audit.md",
  discipline: "Documents",
  label: "Supplier audit",
  description: "Your template, Supplier audit.md",
  skill: null,
  source: "new",
  folder: "docs",
  defaultName: "Supplier audit",
  file: "/p/Templates/Supplier audit.md",
};

describe("library catalog", () => {
  it("maps every offered template and every menu job to exactly one entry", () => {
    const templates = [...NEW_TEMPLATES, ...DOCUMENT_TEMPLATES]
      .map((template) => template.id)
      .filter((id) => !UNLISTED_TEMPLATES.includes(id));
    for (const id of templates) {
      expect(
        LIBRARY_DOCUMENTS.filter((entry) => entry.templates.includes(id)),
        id,
      ).toHaveLength(1);
    }
    for (const { id } of HARDWARE_ACTIONS) {
      expect(
        LIBRARY_DOCUMENTS.filter((entry) => entry.actions.includes(id)),
        id,
      ).toHaveLength(1);
    }
    const jobs = new Set(HARDWARE_ACTIONS.map((job) => job.id));
    expect(
      LIBRARY_DOCUMENTS.flatMap((entry) => entry.templates).filter((id) => !templates.includes(id)),
    ).toEqual([]);
    expect(
      LIBRARY_DOCUMENTS.flatMap((entry) => entry.actions).filter((id) => !jobs.has(id)),
    ).toEqual([]);
  });

  it("keeps one entry for an id a template and a job share", () => {
    for (const id of ["drawing", "test-plan", "instructions"]) {
      expect(entryOfTemplate(id)?.id).toBe(`doc:${id}`);
      expect(entryOfAction(id)?.id).toBe(`doc:${id}`);
    }
  });

  it("uses the code's own labels", () => {
    const names = LIBRARY_DOCUMENTS.map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    expect(entryOfAction("strength")?.name).toBe("Simulation");
  });

  it("says where it is", () => {
    expect(findItIn(doc("doc:drawing"))).toEqual(["New › CAD", "Document › Drawings"]);
    expect(findItIn(doc("doc:simulation"))).toContain("Evaluate › Simulation");
    expect(findItIn(doc("doc:simulation"))).toContain("Evaluate › More simulations");
    expect(findItIn(doc("doc:order"))).toEqual([
      "Manufacture › Sheet metal",
      "Manufacture › Laser and waterjet cutting",
    ]);
  });

  it("names who makes it", () => {
    expect(madeBy(doc("doc:prd"))).toEqual(["the Product requirements (PRD) template"]);
    expect(madeBy(doc("doc:order"))).toEqual(["sendcutsend"]);
    expect(madeBy(doc("doc:manufacturing-check"))).toEqual(["dfm", "dfam-check", "pcb-dfm"]);
    expect(madeBy(doc("doc:parts-list"))).toEqual(["the agent"]);
  });

  it("offers Make one only for what New makes from nothing", () => {
    expect(makeOneTemplate(doc("doc:part"))?.id).toBe("part");
    expect(makeOneTemplate(doc("doc:drawing"))).toBeNull();
    expect(makeOneTemplate(doc("doc:exploded"))).toBeNull();
  });

  it("names a skill that is off", () => {
    const off = [textToCad(false)];
    expect(availability(doc("doc:simulation"), off)).toEqual({
      on: false,
      skill: "fea",
      plugin: "text-to-cad",
      installed: true,
    });
    expect(availability(doc("doc:part"), [])).toEqual({
      on: false,
      skill: "cad",
      plugin: "text-to-cad",
      installed: false,
    });
    expect(availability(doc("doc:prd"), off)).toEqual({ on: true });
    expect(availability(doc("doc:prd"), [])).toEqual({ on: true });
    expect(availability(doc("doc:simulation"), [textToCad(true)])).toEqual({ on: true });
  });

  it("is on when any one of its templates or jobs is offered", () => {
    const bambu = plugin("bambu", true, [detail("bambu-labs")]);
    expect(availability(doc("doc:print"), [bambu])).toEqual({ on: true });
  });

  it("names the installed plugin that lists a missing skill", () => {
    const simulations = plugin("simulations", false, [detail("fea")]);
    expect(availability(doc("doc:simulation"), [simulations])).toEqual({
      on: false,
      skill: "fea",
      plugin: "simulations",
      installed: true,
    });
  });

  it("lists every skill of every installed plugin", () => {
    const harnesses = plugin("harnesses", true, [
      {
        name: "harness",
        displayName: "Wiring harness",
        description: "Draws wiring harnesses.",
        defaultPrompt: "Draw the harness for the arm.",
      },
    ]);
    const skills = librarySkills([textToCad(false), harnesses]);
    expect(skills.map((skill) => skill.id)).toEqual([
      ...TEXT_TO_CAD_SKILLS.map((name) => `skill:text-to-cad/${name}`),
      "skill:harnesses/harness",
    ]);
    expect(skills.filter((skill) => skill.pluginId === "text-to-cad" && skill.on)).toEqual([]);
    expect(skills.at(-1)).toEqual({
      kind: "skill",
      id: "skill:harnesses/harness",
      pluginId: "harnesses",
      pluginName: "The harnesses plugin",
      name: "harness",
      displayName: "Wiring harness",
      description: "Draws wiring harnesses.",
      tryAsking: "Draw the harness for the arm.",
      on: true,
      example: null,
    });
  });

  it("gives a skill one name: its plugin's for it, else the chat's title-casing", () => {
    const skills = librarySkills([
      plugin("text-to-cad", true, [
        { ...detail("gcode"), displayName: "G-code" },
        detail("pcb-dfm"),
      ]),
    ]);
    expect(skills.map((skill) => skill.displayName)).toEqual(["G-code", "Pcb Dfm"]);
    expect(skillName("gcode", skills)).toBe("G-code");
    expect(skillName("pcb-dfm", skills)).toBe("Pcb Dfm");
    // Not installed: no plugin names it, so it reads as the chat would title it.
    expect(skillName("bambu-labs", skills)).toBe("Bambu Labs");
    expect(madeBy(doc("doc:print"), (skill) => skillName(skill, skills))).toEqual([
      "G-code",
      "Bambu Labs",
    ]);
    expect(madeBy(doc("doc:prd"), (skill) => skillName(skill, skills))).toEqual([
      "the Product requirements (PRD) template",
    ]);
  });

  it("asks something of the sample for each of text-to-cad's skills", () => {
    const skills = librarySkills([textToCad(true, "Use this skill.")]);
    expect(skills).toHaveLength(16);
    expect(
      skills.filter((skill) => skill.tryAsking === null || skill.tryAsking === "Use this skill."),
    ).toEqual([]);
  });

  it("shows each skill where New and the menus offer it", () => {
    expect(showsUpAs("dfm")).toEqual([
      "Manufacture: Check for CNC machining, Check as sheet metal, Check for injection molding",
    ]);
    expect(showsUpAs("fea")).toEqual([
      "New: Strength study",
      "Evaluate: Strength under load, Vibration, Drop test, Make it lighter, Explain these results, More simulations",
    ]);
    expect(showsUpAs("urdf")).toEqual(["New: Robot description", "Document: More documents"]);
    expect(showsUpAs("sendcutsend")).toEqual(["Manufacture: Order from SendCutSend"]);
    expect(showsUpAs("no-such-skill")).toEqual([]);
  });

  it("gives each own template its own entry", () => {
    const own = ownTemplateEntries([fileTemplate])[0]!;
    expect(own).toMatchObject({
      id: "own:/p/Templates/Supplier audit.md",
      name: "Supplier audit",
      example: null,
    });
    expect(makeOneTemplate(own)).toEqual(fileTemplate);
    expect(findItIn(own)).toEqual(["New › Documents"]);
    expect(madeBy(own)).toEqual(["the Supplier audit template"]);
    expect(availability(own, [])).toEqual({ on: true });
  });

  it("has a real example for every entry", () => {
    expect(TEXT_TO_CAD_SKILLS).toHaveLength(16);
    const entries = [...LIBRARY_DOCUMENTS, ...librarySkills([textToCad(true)])];
    expect(Object.keys(EXAMPLES).toSorted()).toEqual(entries.map((entry) => entry.id).toSorted());
    expect(entries.filter((entry) => entry.example === null).map((entry) => entry.id)).toEqual(
      NOT_MADE,
    );
    const files = [
      ...entries.flatMap((entry) => (entry.example === null ? [] : [entry.example])),
      ...Object.values(EXAMPLES).flatMap((item) =>
        item === null || item.picture === "page" ? [] : [item.picture],
      ),
    ];
    expect(files.filter((file) => !NodeFS.existsSync(NodePath.join(SAMPLE, file)))).toEqual([]);
  });
});
