import { describe, expect, it } from "vite-plus/test";

import {
  describePart,
  documentOf,
  readBuild,
  readDocumentId,
  readDocumentKind,
  readDocumentName,
  readMaterials,
  readTunnelJson,
  readUpdated,
  readViewSync,
  sharedLoad,
} from "./partContext";

const MODEL = "0b9c3c1e-5d0a-5f8e-9a43-2f1d6c7b8a90";

const tunnel = async (value: unknown, gzip = false) => {
  let bytes = new TextEncoder().encode(JSON.stringify(value));
  if (gzip) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
    bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return {
    structuredContent: {
      status: 200,
      headers: { "content-type": "application/json" },
      body: btoa(String.fromCharCode(...bytes)),
      ...(gzip ? { encoding: "gzip" } : {}),
    },
  };
};

describe("describePart", () => {
  it("names a model by the name the engine gives it, a part or an assembly as its parts say", () => {
    expect(describePart(MODEL, "part", "servo_bracket")).toEqual({
      name: "Servo bracket",
      kind: "Part",
      units: "mm",
    });
    expect(describePart(MODEL, "assembly", "arm").kind).toBe("Assembly");
    // Before its document is read it is a part, by no name of its own yet.
    expect(describePart(MODEL, null)).toMatchObject({ kind: "Part", units: "mm" });
    expect(describePart("/work/plate.xbf", "part").kind).toBe("Part");
  });

  it("names a STEP after its file and says part or assembly as its document does", () => {
    expect(describePart("/work/servo_bracket.step", "part")).toEqual({
      name: "Servo bracket",
      kind: "Part",
      units: "mm",
    });
    expect(describePart("/work/arm.STEP", "assembly").kind).toBe("Assembly");
  });

  it("names a result after the model it came from", () => {
    expect(describePart("/work/bracket.fea.glb", null)).toEqual({
      name: "Bracket",
      kind: "FEA study",
      units: "mm",
    });
    expect(describePart("/work/plate.cam.glb", null).kind).toBe("CAM job");
    expect(describePart("/work/mesh.glb", null).kind).toBe("Mesh");
  });

  it("gives boards millimetres, robots metres, and a drawing or schematic none", () => {
    expect(describePart("/b/main.kicad_pcb", null)).toMatchObject({ kind: "Board", units: "mm" });
    expect(describePart("/b/main.kicad_sch", null).units).toBeNull();
    expect(describePart("/r/arm.urdf", null).units).toBe("m");
    expect(describePart("/d/panel.dxf", null).units).toBeNull();
  });

  it("keeps a file it does not know by its whole name", () => {
    expect(describePart("C:\\work\\notes.txt", null)).toEqual({
      name: "notes.txt",
      kind: "File",
      units: null,
    });
  });
});

describe("readViewSync", () => {
  const sync = (args: Record<string, unknown>, reply: Record<string, unknown> = {}) => ({
    pluginId: "text-to-cad",
    server: "cad",
    name: "cad_sync",
    arguments: { view: "v1", surface: "thread", ...args },
    result: { content: [], structuredContent: { events: [], ...reply } },
  });

  it("reads the document a view shows, a file's path or a model's id, and the catalog's revision", () => {
    expect(
      readViewSync(
        sync(
          { model: "/work/bracket.step", state: { revision: "7" } },
          { catalog: { revision: "c41" } },
        ),
      ),
    ).toEqual({
      pluginId: "text-to-cad",
      server: "cad",
      path: "/work/bracket.step",
      revision: "c41",
    });
    expect(readViewSync(sync({ model: MODEL }, { catalog: { revision: "c42" } }))).toMatchObject({
      path: MODEL,
      revision: "c42",
    });
  });

  it("falls back to the viewer's revision, which it reports as a string", () => {
    const shown = readViewSync(sync({ model: "/work/mesh.stl", state: { revision: "12" } }));
    expect(shown).toMatchObject({ revision: "12" });
  });

  it("ignores the home, a closing view and every other call", () => {
    expect(readViewSync(sync({ model: null }))).toBeNull();
    expect(readViewSync(sync({ model: "/work/a.step", closed: true }))).toBeNull();
    expect(readViewSync({ ...sync({ model: "/work/a.step" }), name: "cad_http" })).toBeNull();
  });
});

describe("the engine's document", () => {
  it("is a model's by its id, a STEP's or an xbf's by the id the engine answers for it, else none", () => {
    expect(documentOf(MODEL)).toEqual({ id: MODEL });
    expect(documentOf("/work/bracket.STEP")).toEqual({ file: "/work/bracket.STEP" });
    expect(documentOf("/work/XBF/plate.xbf")).toEqual({ file: "/work/XBF/plate.xbf" });
    expect(documentOf("/work/mesh.stl")).toBeNull();
    expect(readDocumentId({ doc: MODEL, url: `/__cad/api/doc/${MODEL}` })).toBe(MODEL);
    // Still being read (202): no id yet.
    expect(readDocumentId({ state: "reading", retryMs: 250 })).toBeNull();
  });

  const structure = (instances: number, materials: ReadonlyArray<string | null>) => ({
    name: "rig",
    prototypes: materials.map((name, index) => ({
      index,
      key: `k${index}`,
      name: `p${index}`,
      material: name === null ? null : { name, density: 2.7 },
    })),
    instances: Array.from({ length: instances }, (_, index) => ({
      prototype: 0,
      path: `rig/p${index}`,
    })),
  });

  it("is an assembly when more than one part is placed in it", () => {
    expect(readDocumentKind(structure(1, [null]))).toBe("part");
    expect(readDocumentKind(structure(3, [null, null]))).toBe("assembly");
    expect(readDocumentKind(null)).toBeNull();
    expect(readDocumentName(structure(1, [null]))).toBe("rig");
  });

  it("lists the named materials its parts are made of, once each", () => {
    expect(readMaterials(structure(3, ["Aluminium 6061", "ABS", "Aluminium 6061", null]))).toEqual([
      "Aluminium 6061",
      "ABS",
    ]);
    expect(readMaterials(structure(1, [null]))).toEqual([]);
  });
});

describe("readBuild", () => {
  it("reports a model's build in flight or failed as the news, in the build's own words", () => {
    expect(
      readBuild({ version: "3-1", building: { phase: "running" }, failed: null }, 1000, true),
    ).toEqual({
      state: "building",
    });
    expect(
      readBuild(
        { version: "3-1", building: null, failed: { model: "plate", error: "fillet failed" } },
        1000,
        true,
      ),
    ).toEqual({ state: "failed", error: "fillet failed" });
  });

  it("dates a model by its last build and a file by its own time, from Recents' updated", () => {
    const current = { version: "3-1", building: null, failed: null };
    expect(readBuild(current, 1_700_000_000_000, true)).toEqual({
      state: "built",
      at: 1_700_000_000_000,
    });
    expect(readBuild(current, 2000, false)).toEqual({ state: "saved", at: 2000 });
    expect(readBuild(null, 2000, false)).toEqual({ state: "saved", at: 2000 });
    expect(readBuild(null, null, true)).toBeNull();
  });
});

describe("readUpdated", () => {
  it("finds the document in Recents, a model by its id, and converts seconds to milliseconds", () => {
    const recents = {
      recents: [
        { path: "/work/bracket.step", kind: "file", updated: 1_700_000_000 },
        { path: MODEL, id: MODEL, kind: "model", updated: 1_700_000_100.5 },
      ],
    };
    expect(readUpdated(recents, "/work/bracket.step")).toBe(1_700_000_000_000);
    expect(readUpdated(recents, MODEL)).toBe(1_700_000_100_500);
    expect(readUpdated(recents, "/work/other.step")).toBeNull();
    // cadgen 0.7's `modified` is no time cadgen 0.8 gives.
    expect(readUpdated({ recents: [{ path: "/w/a.step", modified: 5 }] }, "/w/a.step")).toBeNull();
  });
});

describe("readTunnelJson", () => {
  it("reads a cad_http body, gzipped or not", async () => {
    expect(await readTunnelJson(await tunnel({ entries: [] }))).toEqual({ entries: [] });
    expect(await readTunnelJson(await tunnel({ entries: [{ kind: "part" }] }, true))).toEqual({
      entries: [{ kind: "part" }],
    });
  });

  it("is null for a route that did not answer 200", async () => {
    expect(
      await readTunnelJson({ structuredContent: { status: 404, headers: {}, body: "" } }),
    ).toBeNull();
  });
});

describe("sharedLoad", () => {
  it("runs one load for callers asking while it runs, and a fresh one after it settles", async () => {
    const inFlight = new Map<string, Promise<number>>();
    let loads = 0;
    let finish: (value: number) => void = () => undefined;
    const load = () => {
      loads += 1;
      return new Promise<number>((resolve) => {
        finish = resolve;
      });
    };
    const first = sharedLoad(inFlight, "bracket.step\n3", load);
    const second = sharedLoad(inFlight, "bracket.step\n3", load);
    expect(loads).toBe(1);
    finish(7);
    expect(await Promise.all([first, second])).toEqual([7, 7]);
    const later = sharedLoad(inFlight, "bracket.step\n3", () => Promise.resolve(8));
    expect(await later).toBe(8);
  });

  it("loads each key on its own", () => {
    const inFlight = new Map<string, Promise<string>>();
    let loads = 0;
    const load = () => {
      loads += 1;
      return new Promise<string>(() => undefined);
    };
    void sharedLoad(inFlight, "a", load);
    void sharedLoad(inFlight, "b", load);
    expect(loads).toBe(2);
  });
});
