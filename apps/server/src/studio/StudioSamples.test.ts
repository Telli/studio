import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";

import { readSamples } from "./StudioSamples.ts";

const sampleFile = (id: string, name: string) =>
  JSON.stringify({
    sample: id,
    version: 1,
    name,
    purpose: `A ${name}.`,
    shows: ["CNC"],
    picture: "pictures/a.png",
    open: "parts/a.step",
  });

it.effect("lists the good samples by name and skips a bad folder", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-samples-" });
    const write = (folder: string, contents: string) =>
      fileSystem
        .makeDirectory(path.join(dir, folder), { recursive: true })
        .pipe(
          Effect.andThen(
            fileSystem.writeFileString(path.join(dir, folder, "studio-sample.json"), contents),
          ),
        );
    yield* write("zebra", sampleFile("zebra", "Zebra stand"));
    yield* write("apple", sampleFile("apple", "Apple holder"));
    yield* write("broken", '{ "sample": "broken" }');
    yield* fileSystem.makeDirectory(path.join(dir, "no-json"));

    const samples = yield* readSamples(dir);

    assert.deepStrictEqual(
      samples.map((sample) => sample.id),
      ["apple", "zebra"],
    );
    assert.strictEqual(samples[0]?.path, path.resolve(dir, "apple"));
    assert.strictEqual(samples[0]?.open, "parts/a.step");
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("has no samples while the folder is missing", () =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const dir = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-samples-" });
    const path = yield* Path.Path;
    assert.deepStrictEqual(yield* readSamples(path.join(dir, "missing")), []);
  }).pipe(Effect.provide(NodeServices.layer)),
);
