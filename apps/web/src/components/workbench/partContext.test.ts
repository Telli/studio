import { describe, expect, it } from "vite-plus/test";

import {
  describePart,
  readBuild,
  readMaterials,
  readModified,
  readTunnelJson,
  readViewSync,
  sharedLoad,
} from "./partContext";

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
  it("names a STEP after its file and says part or assembly as the catalog does", () => {
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

  it("reads the model, the catalog's revision and the model's own build feed", () => {
    expect(
      readViewSync(
        sync(
          { model: "/work/bracket.step", state: { revision: "7" } },
          {
            catalog: { revision: "c41" },
            previews: [
              { file: "/work/other.step", state: "failed" },
              { file: "/work/bracket.step", state: "running" },
            ],
          },
        ),
      ),
    ).toEqual({
      pluginId: "text-to-cad",
      server: "cad",
      path: "/work/bracket.step",
      revision: "c41",
      preview: { file: "/work/bracket.step", state: "running" },
    });
  });

  it("falls back to the viewer's revision, which it reports as a string", () => {
    const shown = readViewSync(sync({ model: "/work/mesh.stl", state: { revision: "12" } }));
    expect(shown).toMatchObject({ revision: "12", preview: null });
  });

  it("ignores the home, a closing view and every other call", () => {
    expect(readViewSync(sync({ model: null }))).toBeNull();
    expect(readViewSync(sync({ model: "/work/a.step", closed: true }))).toBeNull();
    expect(readViewSync({ ...sync({ model: "/work/a.step" }), name: "cad_http" })).toBeNull();
  });
});

describe("readMaterials", () => {
  it("lists the named materials the model's sidecar declares, once each", () => {
    const entry = {
      sourceSidecar: {
        appearance: {
          materials: {
            body: { name: "Aluminum 6061" },
            cap: { name: "Black anodized" },
            spare: { name: "Aluminum 6061" },
          },
          assignments: {},
        },
      },
    };
    expect(readMaterials(entry)).toEqual(["Aluminum 6061", "Black anodized"]);
  });

  it("is empty for a model with no sidecar", () => {
    expect(readMaterials({ file: "/work/plain.step", kind: "part" })).toEqual([]);
  });
});

describe("readBuild", () => {
  it("reports a build in flight or failed as the news", () => {
    expect(readBuild({ state: "running" }, 1000)).toEqual({ state: "building" });
    expect(readBuild({ state: "queued" }, null)).toEqual({ state: "building" });
    expect(readBuild({ state: "failed", error: "fillet failed" }, 1000)).toEqual({
      state: "failed",
      error: "fillet failed",
    });
  });

  it("dates a finished build by the build feed", () => {
    expect(readBuild({ state: "done", updatedAt: 1_700_000_000_000 }, 5)).toEqual({
      state: "built",
      at: 1_700_000_000_000,
    });
  });

  it("falls back to the file's own time once the file moved past the build, or there is none", () => {
    expect(readBuild({ state: "failed", error: "x", superseded: true }, 2000)).toEqual({
      state: "saved",
      at: 2000,
    });
    expect(readBuild({ state: "disconnected" }, 2000)).toEqual({ state: "saved", at: 2000 });
    expect(readBuild(null, null)).toBeNull();
  });
});

describe("readModified", () => {
  it("finds the file in the library and converts seconds to milliseconds", () => {
    const recents = { recents: [{ path: "/work/bracket.step", modified: 1_700_000_000 }] };
    expect(readModified(recents, "/work/bracket.step")).toBe(1_700_000_000_000);
    expect(readModified(recents, "/work/other.step")).toBeNull();
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
