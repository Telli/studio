import type { InstalledPlugin, PluginSkillDetail } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { LIBRARY_DOCUMENTS, librarySkills } from "./libraryCatalog";
import { filterLibrary, libraryGroup, validateLibrarySearch } from "./librarySearch";

/** A display name that no document type's own words hold, so only the shown name can find it. */
const DISPLAY_NAMES: Readonly<Record<string, string>> = { fea: "Finite element analysis" };

const detail = (name: string): PluginSkillDetail => ({
  name,
  displayName: DISPLAY_NAMES[name] ?? null,
  description: `What ${name} does.`,
  defaultPrompt: null,
});

const SKILLS = ["cad", "dfam-check", "engineering-drawing", "fea", "sendcutsend"];

/** text-to-cad, enabled, with the skills these searches reach. */
const fixturePlugins: ReadonlyArray<InstalledPlugin> = [
  {
    id: "text-to-cad",
    displayName: "text-to-cad",
    description: "",
    version: null,
    publisher: null,
    enabled: true,
    marketplace: null,
    commit: null,
    skills: SKILLS,
    skillDetails: SKILLS.map(detail),
    servers: [],
    views: [],
    compatibility: { level: "works", label: "Works", notes: [] },
    updateAvailable: false,
    error: null,
  },
];

const all = [...LIBRARY_DOCUMENTS, ...librarySkills(fixturePlugins)];
const found = (query: string) => filterLibrary(all, query).map((entry) => entry.id);
const doc = (id: string) => LIBRARY_DOCUMENTS.find((entry) => entry.id === id)!;

describe("filterLibrary", () => {
  it("finds a document type and a skill by name, whatever the case", () => {
    expect(found("DRAWING")).toEqual(
      expect.arrayContaining(["doc:drawing", "skill:text-to-cad/engineering-drawing"]),
    );
  });

  it("finds a document type by the skill that makes it", () => {
    expect(found("sendcutsend")).toContain("doc:order");
    expect(found("dfam-check")).toContain("doc:manufacturing-check");
  });

  it("finds a document type by its skill's name as the page shows it, and by its own name", () => {
    expect(found("finite element")).toEqual(
      expect.arrayContaining(["doc:simulation", "skill:text-to-cad/fea"]),
    );
    expect(found("fea")).toContain("doc:simulation");
  });

  it("finds a document type by where it is", () => {
    expect(found("Evaluate")).toContain("doc:simulation");
  });

  it("finds under New only what New makes from nothing", () => {
    const underNew = found("New");
    expect(underNew).toEqual(expect.arrayContaining(["doc:part", "doc:prd", "doc:robot"]));
    // Their templates work from a part, which no New offers.
    const fromPart = new Set([
      "doc:drawing",
      "doc:simulation",
      "doc:cam-job",
      "doc:print",
      "doc:cut-file",
      "doc:test-plan",
      "doc:instructions",
    ]);
    expect(underNew.filter((id) => fromPart.has(id))).toEqual([]);
  });

  it("lists everything for a blank search", () => {
    expect(filterLibrary(all, "  ")).toEqual(all);
  });
});

describe("libraryGroup", () => {
  it("lists a document type once: under its first job's menu, else under New", () => {
    expect(libraryGroup(doc("doc:part"))).toBe("New");
    expect(libraryGroup(doc("doc:prd"))).toBe("New");
    expect(libraryGroup(doc("doc:simulation"))).toBe("Evaluate");
    expect(libraryGroup(doc("doc:board"))).toBe("Manufacture");
    // Its toolpaths are in Manufacture and its results in Evaluate: it shows in the first.
    expect(libraryGroup(doc("doc:cam-job"))).toBe("Manufacture");
    expect(libraryGroup(doc("doc:drawing"))).toBe("Document");
  });
});

describe("validateLibrarySearch", () => {
  it("keeps an entry, a group and the page it was opened from", () => {
    expect(
      validateLibrarySearch({ entry: "doc:part", group: "Evaluate", from: "/env-1/thread-9" }),
    ).toEqual({ entry: "doc:part", group: "Evaluate", from: "/env-1/thread-9" });
  });

  it("ignores an unknown group, and a page outside the app or the library itself", () => {
    // Every key is set, so a bad value in the URL can't show through the router's raw search.
    expect(
      validateLibrarySearch({ entry: 7, group: "Settings", from: "//example.com" }),
    ).toStrictEqual({ entry: undefined, group: undefined, from: undefined });
    expect(validateLibrarySearch({ from: "https://example.com" }).from).toBeUndefined();
    expect(validateLibrarySearch({ from: "/library?group=New" }).from).toBeUndefined();
  });
});
