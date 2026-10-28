import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { folderModelsStore } from "./useFolderModels";

const env = "env-1" as EnvironmentId;
const model = (id: string, name: string) => ({
  id,
  name,
  script: `parts/${name}.py`,
  kind: "part",
  updated: 1,
});

/** The CAD service, answering each request when told to, recording what it was asked. */
function service() {
  const asked: string[] = [];
  const pending: Array<(reply: unknown) => void> = [];
  const get = (url: string) => {
    asked.push(url);
    return new Promise<unknown>((resolve) => pending.push(resolve));
  };
  return { asked, pending, get };
}

/** A store whose batches flush when the test says. */
function store() {
  const flushes: Array<() => void> = [];
  return {
    store: folderModelsStore((flush) => flushes.push(flush)),
    flush: () => flushes.splice(0).forEach((flush) => flush()),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("project folders' models", () => {
  const roots = Array.from({ length: 20 }, (_, index) => `/p/tile${index}`);

  it("reads twenty folders, and again after an agent's edit, in one request each time", async () => {
    const { store: models, flush } = store();
    const cad = service();
    // Twenty Home tiles, each asking for its own folder.
    for (const root of roots) models.want(env, [root], cad.get);
    flush();
    expect(cad.asked).toHaveLength(1);
    expect(cad.asked[0]).toBe(
      `/__cad/models?${roots.map((root) => `root=${encodeURIComponent(root)}`).join("&")}`,
    );
    cad.pending[0]!({
      roots: Object.fromEntries(
        roots.map((root, index) => [root, [model(`id-${index}`, `p${index}`)]]),
      ),
    });
    await settle();
    expect(models.models(env, "/p/tile3").map((entry) => entry.name)).toEqual(["p3"]);
    // Read already at this revision: asking again asks nothing.
    for (const root of roots) models.want(env, [root], cad.get);
    flush();
    expect(cad.asked).toHaveLength(1);
    // One edit, one more request for all twenty.
    models.changed();
    for (const root of roots) models.want(env, [root], cad.get);
    flush();
    expect(cad.asked).toHaveLength(2);
  });

  it("keeps each folder's last models while a newer read is under way", async () => {
    const { store: models, flush } = store();
    const cad = service();
    models.want(env, ["/p/a"], cad.get);
    flush();
    cad.pending[0]!({ roots: { "/p/a": [model("id-a", "plate")] } });
    await settle();
    models.changed();
    models.want(env, ["/p/a"], cad.get);
    flush();
    // Asked again, not answered yet: the cover, the starters and ⌘K still have the plate.
    expect(cad.asked).toHaveLength(2);
    expect(models.models(env, "/p/a").map((entry) => entry.name)).toEqual(["plate"]);
    cad.pending[1]!({ roots: { "/p/a": [model("id-a", "plate"), model("id-b", "bracket")] } });
    await settle();
    expect(models.models(env, "/p/a").map((entry) => entry.name)).toEqual(["plate", "bracket"]);
    // A read that fails keeps them too.
    models.changed();
    models.want(env, ["/p/a"], cad.get);
    flush();
    cad.pending[2]!(null);
    await settle();
    expect(models.models(env, "/p/a")).toHaveLength(2);
    expect(models.title("id-b")).toBe("Bracket");
  });

  it("knows each model's script by its id, absolute in the folder that holds it", async () => {
    const { store: models, flush } = store();
    const cad = service();
    models.want(env, ["/p/a", "/p/b"], cad.get);
    flush();
    cad.pending[0]!({
      roots: { "/p/a": [model("id-a", "plate")], "/p/b": [model("id-b", "horn")] },
    });
    await settle();
    expect(models.script("id-b")).toBe("/p/b/parts/horn.py");
    expect(models.script("id-c")).toBeUndefined();
  });
});
