import { assert, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import type { StudioProject } from "@t3tools/contracts";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { EMPTY_STUDIO_BRIEF } from "@t3tools/shared/studioProjects";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type * as Scope from "effect/Scope";

import * as ProcessRunner from "../processRunner.ts";
import * as StudioProjects from "./StudioProjects.ts";

const GIT_KEYS = [
  "EMAIL",
  "GIT_AUTHOR_NAME",
  "GIT_AUTHOR_EMAIL",
  "GIT_COMMITTER_NAME",
  "GIT_COMMITTER_EMAIL",
  "GIT_CONFIG_GLOBAL",
  "GIT_CONFIG_NOSYSTEM",
] as const;

/**
 * Runs `body` against the service with its home directory in a fresh temp
 * folder and `environment` as its process environment. Git reads only a
 * global config of the test's own, with a test identity unless `gitIdentity`
 * is false, so the developer's settings stay out.
 */
const withStudio = <A, E>(
  body: (
    home: string,
  ) => Effect.Effect<A, E, StudioProjects.StudioProjects | NodeServices.NodeServices | Scope.Scope>,
  options: { readonly environment?: NodeJS.ProcessEnv; readonly gitIdentity?: boolean } = {},
) =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const home = yield* fileSystem.makeTempDirectoryScoped({ prefix: "t3-studio-home-" });
    const globalConfig = yield* fileSystem.makeTempFileScoped({ prefix: "t3-gitconfig-" });
    const gitIdentity = options.gitIdentity ?? true;
    // Without an identity, git must not guess one from the host name either.
    if (!gitIdentity) {
      yield* fileSystem.writeFileString(globalConfig, "[user]\n\tuseConfigOnly = true\n");
    }
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const saved = GIT_KEYS.map((key) => [key, process.env[key]] as const);
        for (const key of GIT_KEYS) delete process.env[key];
        Object.assign(process.env, {
          GIT_CONFIG_GLOBAL: globalConfig,
          GIT_CONFIG_NOSYSTEM: "1",
          ...(gitIdentity
            ? {
                GIT_AUTHOR_NAME: "Test",
                GIT_AUTHOR_EMAIL: "test@test.com",
                GIT_COMMITTER_NAME: "Test",
                GIT_COMMITTER_EMAIL: "test@test.com",
              }
            : {}),
        });
        return saved;
      }),
      (saved) =>
        Effect.sync(() => {
          for (const [key, value] of saved) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
        }),
    );
    return yield* body(home).pipe(
      Effect.provide(
        StudioProjects.layer.pipe(
          Layer.provide(ProcessRunner.layer),
          Layer.provide(Layer.succeed(HostProcess.HomeDirectory, home)),
          Layer.provide(Layer.succeed(HostProcess.Environment, options.environment ?? {})),
        ),
      ),
    );
  }).pipe(Effect.scoped, Effect.provide(NodeServices.layer));

const git = (cwd: string, args: ReadonlyArray<string>) =>
  ProcessRunner.ProcessRunner.pipe(
    Effect.flatMap((runner) => runner.run({ command: "git", args: ["-C", cwd, ...args] })),
    Effect.map((result) => result.stdout.trim()),
    Effect.provide(ProcessRunner.layer),
  );

/** A project with one folder under `home` and one outside it. */
const roverArm = (home: string, path: Path.Path): StudioProject => ({
  name: "Rover arm",
  template: "robot",
  brief: { ...EMPTY_STUDIO_BRIEF, purpose: "A three-joint arm for the rover deck." },
  folders: [path.join(home, "code", "rover-cad"), "/opt/shared/rover-board"],
  createdAt: "2026-10-14T00:00:00.000Z",
});

it.effect("has no projects, and makes no folder, while the folder is missing", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const listed = yield* studio.list;
      assert.equal(listed.folder, path.join(home, "studio-projects"));
      assert.deepEqual(listed.projects, {});
      assert.isFalse(yield* fileSystem.exists(listed.folder));
    }),
  ),
);

it.effect("saves a project as a folder of its own: a readable file, a README and a commit", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const cad = path.join(home, "code", "rover-cad");
      yield* fileSystem.makeDirectory(cad, { recursive: true });
      const hasGit = (yield* studio.list).git;
      if (hasGit) {
        yield* git(cad, ["init", "--quiet"]);
        // A token in a remote URL must not reach a file meant to be pushed.
        yield* git(cad, [
          "remote",
          "add",
          "origin",
          "https://me:secret@github.com/x/rover-cad.git",
        ]);
      }

      const saved = yield* studio.save({ id: null, project: roverArm(home, path) });
      const folder = path.join(saved.folder, "rover-arm");
      assert.equal(saved.id, "rover-arm");

      const raw = yield* fileSystem.readFileString(path.join(folder, "project.json"));
      assert.isTrue(raw.startsWith('{\n  "studio": 1,\n  "name": "Rover arm",'));
      assert.isTrue(raw.endsWith("}\n"));
      assert.deepEqual(JSON.parse(raw).folders, [
        hasGit
          ? { path: "~/code/rover-cad", remote: "https://github.com/x/rover-cad.git" }
          : { path: "~/code/rover-cad" },
        { path: "/opt/shared/rover-board" },
      ]);
      const readme = yield* fileSystem.readFileString(path.join(folder, "README.md"));
      assert.include(readme, "# Rover arm\n\nA three-joint arm for the rover deck.");
      assert.include(readme, "- `/opt/shared/rover-board`\n");
      assert.include(readme, "push this repository to share the project");
      if (!hasGit) return;

      assert.include(readme, "- `~/code/rover-cad` (https://github.com/x/rover-cad.git)");
      assert.equal(yield* git(folder, ["log", "--format=%s"]), "Add Rover arm");
      // The root holds the project repositories; it is not one itself.
      assert.isFalse(yield* fileSystem.exists(path.join(saved.folder, ".git")));

      yield* studio.save({
        id: "rover-arm",
        project: { ...roverArm(home, path), name: "Rover arm v2" },
      });
      assert.equal(
        yield* git(folder, ["log", "--format=%s"]),
        "Update Rover arm v2\nAdd Rover arm",
      );
      assert.include(
        yield* fileSystem.readFileString(path.join(folder, "README.md")),
        "# Rover arm v2",
      );
      assert.equal(yield* git(folder, ["status", "--porcelain"]), "");
    }),
  ),
);

it.effect("names a new project's folder from its name, never reusing one that exists", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      // A folder that is no project still claims its name.
      yield* fileSystem.makeDirectory(path.join(home, "studio-projects", "bench"), {
        recursive: true,
      });
      const idFor = (name: string) =>
        studio
          .save({ id: null, project: { ...roverArm(home, path), name } })
          .pipe(Effect.map((result) => result.id));

      assert.equal(yield* idFor("Rover Arm!"), "rover-arm");
      assert.equal(yield* idFor("rover arm"), "rover-arm-2");
      assert.equal(yield* idFor("Bench"), "bench-2");
      assert.equal(yield* idFor("!!!"), "project");
      const long = yield* idFor(`${"Long name ".repeat(10)}end`);
      assert.isAtMost(long.length, 60);
      assert.match(long, /^long-name-long-name-[a-z0-9-]*[a-z0-9]$/);

      const escape = yield* studio
        .save({ id: "../escape", project: roverArm(home, path) })
        .pipe(Effect.flip);
      assert.equal(escape.failure, "invalid-id");
    }),
  ),
);

it.effect("lists what it saved, with folders under home written as ~ and read back whole", () =>
  withStudio(
    (home) =>
      Effect.gen(function* () {
        const studio = yield* StudioProjects.StudioProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const project: StudioProject = {
          ...roverArm(home, path),
          remotes: { "/opt/shared/rover-board": "git@github.com:x/rover-board.git" },
        };
        const saved = yield* studio.save({ id: null, project });
        assert.equal(saved.folder, path.join(home, "shared", "studio"));
        assert.include(
          yield* fileSystem.readFileString(path.join(saved.folder, saved.id, "project.json")),
          '"path": "~/code/rover-cad"',
        );
        // A folder this machine cannot ask keeps the remote it came with.
        assert.deepEqual((yield* studio.list).projects, { [saved.id]: project });
      }),
    { environment: { STUDIO_PROJECTS_DIR: "~/shared/studio" } },
  ),
);

it.effect("removes a project's file but keeps its folder and history", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const saved = yield* studio.save({ id: null, project: roverArm(home, path) });
      const folder = path.join(saved.folder, saved.id);

      const removed = yield* studio.save({ id: saved.id, project: null });

      assert.equal(removed.id, saved.id);
      assert.deepEqual(removed.projects, {});
      assert.isFalse(yield* fileSystem.exists(path.join(folder, "project.json")));
      assert.isTrue(yield* fileSystem.exists(path.join(folder, "README.md")));
      if (!removed.git) return;
      assert.equal(yield* git(folder, ["log", "--format=%s"]), "Remove Rover arm\nAdd Rover arm");
      assert.equal(yield* git(folder, ["status", "--porcelain"]), "");
    }),
  ),
);

it.effect("skips a project folder whose file is not a project, keeping the rest", () =>
  withStudio((home) =>
    Effect.gen(function* () {
      const studio = yield* StudioProjects.StudioProjects;
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const saved = yield* studio.save({ id: null, project: roverArm(home, path) });
      const write = (relative: string, contents: string) =>
        Effect.gen(function* () {
          const file = path.join(saved.folder, relative);
          yield* fileSystem.makeDirectory(path.dirname(file), { recursive: true });
          yield* fileSystem.writeFileString(file, contents);
        });
      yield* write("broken/project.json", "{ not json");
      yield* write("half/project.json", '{ "studio": 1, "name": "Half" }');
      yield* write("notes.txt", "not a folder");

      assert.deepEqual(Object.keys((yield* studio.list).projects), [saved.id]);
    }),
  ),
);

it.effect("still saves a project when git cannot commit it", () =>
  withStudio(
    (home) =>
      Effect.gen(function* () {
        const studio = yield* StudioProjects.StudioProjects;
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const saved = yield* studio.save({ id: null, project: roverArm(home, path) });
        const folder = path.join(saved.folder, saved.id);

        assert.deepEqual(Object.keys(saved.projects), [saved.id]);
        assert.isTrue(yield* fileSystem.exists(path.join(folder, "README.md")));
        if (!saved.git) return;
        assert.isTrue(yield* fileSystem.exists(path.join(folder, ".git")));
        assert.equal(yield* git(folder, ["log", "--format=%s"]), "");
      }),
    { gitIdentity: false },
  ),
);
