/**
 * StudioProjects - Studio's projects (`StudioProject` in contracts) as files
 * the user can read, diff and share. A root folder (`$STUDIO_PROJECTS_DIR`,
 * else `~/studio-projects`) holds one folder per project, `<root>/<id>/`, with
 * its `project.json` and a README Studio writes. Where git is available each
 * project folder is its own repository and every save is a commit, so pushing
 * that repository shares that project. Git is best-effort: a save never fails
 * over it.
 *
 * @module StudioProjects
 */
import {
  StudioProject,
  StudioProjectsError,
  type StudioProjectsListResult,
  type StudioProjectsSaveInput,
  type StudioProjectsSaveResult,
} from "@t3tools/contracts";
import { expandHomePath } from "@t3tools/provider-core/server/pathExpansion";
import { writeFileStringAtomically } from "@t3tools/shared/atomicWrite";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { newProjectFolderName } from "@t3tools/shared/path";
import { fromJsonStringPretty, fromLenientJson } from "@t3tools/shared/schemaJson";
import * as Context from "effect/Context";
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import * as ProcessRunner from "../processRunner.ts";

const PROJECT_FILE = "project.json";
const README_FILE = "README.md";
const MAX_ID_LENGTH = 60;

/**
 * A project as `project.json` holds it: folders under the home directory as
 * `~/...`, so the file reads the same on a teammate's machine, each with its
 * git remote where known.
 */
const StudioProjectFile = Schema.Struct({
  studio: Schema.Literal(1),
  name: StudioProject.fields.name,
  template: StudioProject.fields.template,
  brief: StudioProject.fields.brief,
  folders: Schema.Array(
    Schema.Struct({ path: Schema.String, remote: Schema.optionalKey(Schema.String) }),
  ),
  createdAt: StudioProject.fields.createdAt,
});
type StudioProjectFile = typeof StudioProjectFile.Type;

// Lenient on read, since people edit these by hand; 2-space JSON on write.
const decodeProjectFile = Schema.decodeEffect(fromLenientJson(StudioProjectFile));
const encodeProjectFile = Schema.encodeEffect(fromJsonStringPretty(StudioProjectFile));

export class StudioProjects extends Context.Service<
  StudioProjects,
  {
    /**
     * Every project in the root folder by id, its folder's name. A folder with
     * no `project.json` (a removed project) is left out, and one whose file is
     * not a project is left out with a warning. A missing root has none.
     */
    readonly list: Effect.Effect<StudioProjectsListResult, StudioProjectsError>;
    /**
     * Writes one project and its README and commits them; a new project
     * (`id: null`) gets a folder named for it. `project: null` removes one by
     * deleting its `project.json` and committing that, keeping the folder and
     * its history. Saves run one at a time.
     */
    readonly save: (
      input: StudioProjectsSaveInput,
    ) => Effect.Effect<StudioProjectsSaveResult, StudioProjectsError>;
  }
>()("t3/studio/StudioProjects") {}

/** An id is one folder name as written: no separators, not hidden, no edge spaces. */
const isProjectId = (id: string) =>
  id.length > 0 && id.trim() === id && !id.startsWith(".") && !/[\\/]/.test(id);

/** A new project's id: its name as a slug of a-z, 0-9 and dashes. */
const projectSlug = (name: string) =>
  newProjectFolderName(name).slice(0, MAX_ID_LENGTH).replace(/-+$/, "") || "project";

/** A remote without the user and password an https remote can carry, since the file is shared. */
function shareableRemote(remote: string): string {
  if (!/^https?:\/\//i.test(remote) || !URL.canParse(remote)) return remote;
  const url = new URL(remote);
  if (url.username === "" && url.password === "") return remote;
  url.username = "";
  url.password = "";
  return url.href;
}

function projectReadme(file: StudioProjectFile): string {
  const purpose = file.brief.purpose.trim();
  const folders = file.folders.map(
    (folder) => `- \`${folder.path}\`${folder.remote === undefined ? "" : ` (${folder.remote})`}`,
  );
  return [
    `# ${file.name}`,
    "",
    ...(purpose === "" ? [] : [purpose, ""]),
    "## Folders",
    "",
    ...(folders.length === 0 ? ["None yet."] : folders),
    "",
    "Studio keeps this file and `project.json` up to date; push this repository to share the project.",
    "",
  ].join("\n");
}

// Git's own message runs several lines; this is the one failure worth naming.
const commitHint = (stderr: string) =>
  /identity unknown|tell me who you are|no (name|email) was given/i.test(stderr)
    ? { hint: "Git has no name or email on this machine; set user.name and user.email." }
    : {};

const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const processRunner = yield* ProcessRunner.ProcessRunner;
  const home = yield* HostProcess.HomeDirectory;
  const configuredRoot = (yield* HostProcess.Environment).STUDIO_PROJECTS_DIR?.trim();
  const root = path.resolve(
    configuredRoot ? expandHomePath(configuredRoot, home) : path.join(home, "studio-projects"),
  );
  const saveLock = yield* Semaphore.make(1);

  // `-C` rather than a spawn cwd: a missing folder is then git's error, not a
  // spawn failure that looks like git is missing.
  const runGit = (
    folder: string,
    args: ReadonlyArray<string>,
    timeout: Duration.Input = "10 seconds",
  ) =>
    processRunner.run({
      command: "git",
      args: ["-C", folder, ...args],
      timeout,
      timeoutBehavior: "timedOutResult",
    });

  /** Git's trimmed output, or undefined when it fails or prints nothing. */
  const gitOutput = (folder: string, args: ReadonlyArray<string>) =>
    runGit(folder, args, "5 seconds").pipe(
      Effect.map((result) => (result.code === 0 ? result.stdout.trim() : "")),
      Effect.orElseSucceed(() => ""),
      Effect.map((output) => (output === "" ? undefined : output)),
    );

  // Probed once: whether this machine has git, so project folders become repositories.
  const gitAvailable = yield* Effect.cached(
    processRunner
      .run({
        command: "git",
        args: ["--version"],
        timeout: "5 seconds",
        timeoutBehavior: "timedOutResult",
      })
      .pipe(
        Effect.map((result) => result.code === 0),
        Effect.orElseSucceed(() => false),
      ),
  );

  /** One git step in a project folder; false, logged, when it fails, so the caller stops. */
  const gitStep = (folder: string, args: ReadonlyArray<string>) =>
    runGit(folder, args, "30 seconds").pipe(
      Effect.flatMap((result) =>
        result.code === 0
          ? Effect.succeed(true)
          : Effect.logWarning("Saved the Studio project without committing it.", {
              folder,
              step: args[0],
              exitCode: result.code,
              timedOut: result.timedOut,
              ...commitHint(result.stderr),
            }).pipe(Effect.as(false)),
      ),
      Effect.catch((cause) =>
        Effect.logWarning("Saved the Studio project without committing it.", {
          folder,
          step: args[0],
          cause,
        }).pipe(Effect.as(false)),
      ),
    );

  /** Commits `files` in a project folder, making it a repository first. Never fails. */
  const commit = Effect.fnUntraced(function* (
    folder: string,
    files: ReadonlyArray<string>,
    message: string,
  ) {
    if (!(yield* gitAvailable)) return;
    const isRepository = yield* fileSystem
      .exists(path.join(folder, ".git"))
      .pipe(Effect.orElseSucceed(() => false));
    if (!isRepository) {
      const branch =
        (yield* gitOutput(folder, ["config", "--get", "init.defaultBranch"])) ?? "main";
      if (!(yield* gitStep(folder, ["init", "--quiet", `--initial-branch=${branch}`]))) return;
    }
    if (!(yield* gitStep(folder, ["add", "--all", "--", ...files]))) return;
    // Only these files, so anything else the user staged stays theirs to commit.
    yield* gitStep(folder, ["commit", "--quiet", "--message", message, "--", ...files]);
  });

  /** A file's text, None when it does not exist. */
  const readText = (file: string) =>
    fileSystem.readFileString(file).pipe(
      Effect.asSome,
      Effect.catchTags({
        PlatformError: (error) =>
          error.reason._tag === "NotFound"
            ? Effect.succeed(Option.none<string>())
            : Effect.fail(error),
      }),
    );

  /** A project folder's file; None when it has none, or (logged) when it is not a project. */
  const readProjectFile = (id: string) => {
    const file = path.join(root, id, PROJECT_FILE);
    return readText(file).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.succeed(Option.none<StudioProjectFile>()),
          onSome: (raw) => decodeProjectFile(raw).pipe(Effect.asSome),
        }),
      ),
      Effect.catch((cause) =>
        Effect.logWarning("Skipping a Studio project whose project.json is not a project.", {
          file,
          cause,
        }).pipe(Effect.as(Option.none<StudioProjectFile>())),
      ),
    );
  };

  /** Folders under the home directory as `~/...`, with forward slashes. */
  const collapseHome = (folder: string) => {
    if (!path.isAbsolute(folder)) return folder;
    const relative = path.relative(home, folder);
    if (relative === "") return "~";
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return folder;
    }
    return `~/${relative.split(path.sep).join("/")}`;
  };

  const toProject = (file: StudioProjectFile): StudioProject => {
    const folders = file.folders.map((entry) => expandHomePath(entry.path, home));
    const remotes = Object.fromEntries(
      file.folders.flatMap((entry, index) =>
        entry.remote === undefined ? [] : [[folders[index], entry.remote] as const],
      ),
    );
    return {
      name: file.name,
      template: file.template,
      brief: file.brief,
      folders,
      ...(Object.keys(remotes).length === 0 ? {} : { remotes }),
      createdAt: file.createdAt,
    };
  };

  const isDirectory = (folder: string) =>
    fileSystem.stat(folder).pipe(
      Effect.map((info) => info.type === "Directory"),
      Effect.orElseSucceed(() => false),
    );

  const list: StudioProjects["Service"]["list"] = Effect.gen(function* () {
    const names = yield* fileSystem.readDirectory(root).pipe(
      Effect.catchTags({
        PlatformError: (cause) =>
          cause.reason._tag === "NotFound"
            ? Effect.succeed<ReadonlyArray<string>>([])
            : Effect.fail(new StudioProjectsError({ failure: "read", folder: root, cause })),
      }),
    );
    const found = yield* Effect.forEach(
      [...names].filter(isProjectId).sort(),
      (id) =>
        isDirectory(path.join(root, id)).pipe(
          Effect.flatMap((directory) =>
            directory ? readProjectFile(id) : Effect.succeed(Option.none<StudioProjectFile>()),
          ),
          Effect.map(Option.map((file) => [id, toProject(file)] as const)),
        ),
      { concurrency: 8 },
    );
    return {
      folder: root,
      git: yield* gitAvailable,
      projects: Object.fromEntries(found.flatMap(Option.toArray)),
    };
  }).pipe(Effect.withSpan("StudioProjects.list"));

  /** The first of `<slug>`, `<slug>-2`, `<slug>-3`, ... that no folder in the root has. */
  const freshId = Effect.fnUntraced(function* (name: string) {
    const slug = projectSlug(name);
    for (let attempt = 1; ; attempt++) {
      const id = attempt === 1 ? slug : `${slug}-${attempt}`;
      const taken = yield* fileSystem
        .exists(path.join(root, id))
        .pipe(
          Effect.mapError(
            (cause) => new StudioProjectsError({ failure: "write", folder: root, id, cause }),
          ),
        );
      if (!taken) return id;
    }
  });

  /** A folder's `origin`, read fresh, else the one the project already had. */
  const remoteOf = Effect.fnUntraced(function* (project: StudioProject, folder: string) {
    const fresh = (yield* gitAvailable)
      ? yield* gitOutput(folder, ["remote", "get-url", "origin"])
      : undefined;
    return fresh ?? project.remotes?.[folder];
  });

  const write = Effect.fnUntraced(function* (id: string, project: StudioProject) {
    const folder = path.join(root, id);
    const failed = (cause: unknown) =>
      new StudioProjectsError({ failure: "write", folder: root, id, cause });
    const remotes = yield* Effect.forEach(project.folders, (entry) => remoteOf(project, entry), {
      concurrency: 4,
    });
    const file: StudioProjectFile = {
      studio: 1,
      name: project.name,
      template: project.template,
      brief: project.brief,
      folders: project.folders.map((entry, index) => {
        const remote = remotes[index];
        return {
          path: collapseHome(entry),
          ...(remote === undefined ? {} : { remote: shareableRemote(remote) }),
        };
      }),
      createdAt: project.createdAt,
    };
    const json = `${yield* encodeProjectFile(file).pipe(Effect.mapError(failed))}\n`;
    const readme = projectReadme(file);

    const projectPath = path.join(folder, PROJECT_FILE);
    const readmePath = path.join(folder, README_FILE);
    const [previous, previousReadme] = yield* Effect.all([
      readText(projectPath),
      readText(readmePath),
    ]).pipe(Effect.mapError(failed));
    if (
      Option.getOrUndefined(previous) === json &&
      Option.getOrUndefined(previousReadme) === readme
    )
      return;

    yield* fileSystem.makeDirectory(folder, { recursive: true }).pipe(Effect.mapError(failed));
    for (const [filePath, contents] of [
      [projectPath, json],
      [readmePath, readme],
    ] as const) {
      yield* writeFileStringAtomically({ filePath, contents }).pipe(
        Effect.provideService(FileSystem.FileSystem, fileSystem),
        Effect.provideService(Path.Path, path),
        Effect.mapError(failed),
      );
    }
    yield* commit(
      folder,
      [PROJECT_FILE, README_FILE],
      `${Option.isNone(previous) ? "Add" : "Update"} ${project.name}`,
    );
  });

  const remove = Effect.fnUntraced(function* (id: string) {
    const folder = path.join(root, id);
    const previous = yield* readProjectFile(id);
    const removed = yield* fileSystem.remove(path.join(folder, PROJECT_FILE)).pipe(
      Effect.as(true),
      Effect.catchTags({
        PlatformError: (cause) =>
          cause.reason._tag === "NotFound"
            ? Effect.succeed(false)
            : Effect.fail(new StudioProjectsError({ failure: "remove", folder: root, id, cause })),
      }),
    );
    if (!removed) return;
    const name = Option.match(previous, { onNone: () => id, onSome: (file) => file.name });
    yield* commit(folder, [PROJECT_FILE], `Remove ${name}`);
  });

  const save: StudioProjects["Service"]["save"] = (input) =>
    saveLock
      .withPermits(1)(
        Effect.gen(function* () {
          const id =
            input.id ?? (input.project === null ? null : yield* freshId(input.project.name));
          if (id === null || !isProjectId(id)) {
            return yield* new StudioProjectsError({
              failure: "invalid-id",
              folder: root,
              ...(id === null ? {} : { id }),
            });
          }
          if (input.project === null) yield* remove(id);
          else yield* write(id, input.project);
          return { ...(yield* list), id };
        }),
      )
      .pipe(Effect.withSpan("StudioProjects.save"));

  return StudioProjects.of({ list, save });
});

export const layer = Layer.effect(StudioProjects, make);
