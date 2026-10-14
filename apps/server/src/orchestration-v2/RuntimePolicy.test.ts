import { assert, it } from "@effect/vitest";
import {
  type ModelSelection,
  type OrchestrationV2AppThread,
  ProjectId,
  ProviderInstanceId,
  type RuntimeMode,
  type ServerProvider,
  ServerSettingsError,
  type StudioProject,
  ThreadId,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import type { ProviderInstance } from "@t3tools/provider-core/server/driver";
import * as ProviderInstanceRegistry from "../provider/ProviderInstanceRegistry.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as ProjectStore from "./ProjectStore.ts";
import * as RuntimePolicy from "./RuntimePolicy.ts";

const projectId = ProjectId.make("project:runtime-policy");
const providerInstanceId = ProviderInstanceId.make("codex");
const modelSelection = {
  instanceId: providerInstanceId,
  model: "gpt-5.5",
} satisfies ModelSelection;

function makeThread(input: {
  readonly now: DateTime.Utc;
  readonly worktreePath: string | null;
  readonly runtimeMode?: RuntimeMode;
  readonly projectId?: ProjectId;
}): OrchestrationV2AppThread {
  const threadId = ThreadId.make("thread:runtime-policy");
  return {
    createdBy: "user",
    creationSource: "web",
    id: threadId,
    projectId: input.projectId ?? projectId,
    title: "Runtime policy",
    providerInstanceId,
    modelSelection,
    runtimeMode: input.runtimeMode ?? "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: input.worktreePath,
    activeProviderThreadId: null,
    lineage: {
      parentThreadId: null,
      relationshipToParent: null,
      rootThreadId: threadId,
    },
    forkedFrom: null,
    createdAt: input.now,
    updatedAt: input.now,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    lastVisitedAt: null,
    deletedAt: null,
  };
}

// Grok's instance offers no Auto-accept edits; the Codex instance advertises no
// restriction.
const grokInstanceId = ProviderInstanceId.make("grok");
const supportedRuntimeModesByInstance = new Map<ProviderInstanceId, ReadonlyArray<RuntimeMode>>([
  [grokInstanceId, ["approval-required", "auto", "full-access"]],
]);
const providerInstanceFor = (instanceId: ProviderInstanceId) =>
  ({
    snapshot: {
      getSnapshot: Effect.succeed({
        supportedRuntimeModes: supportedRuntimeModesByInstance.get(instanceId),
      } as ServerProvider),
    },
  }) as ProviderInstance;

// A second project whose folder is in no Studio project.
const looseProjectId = ProjectId.make("project:runtime-policy-loose");
const workspaceRoots = new Map<ProjectId, string>([
  [projectId, "/project-root"],
  [looseProjectId, "/loose-root"],
]);

const layerProviderInstances = Layer.succeed(ProviderInstanceRegistry.ProviderInstanceRegistry, {
  getInstance: (instanceId) => Effect.succeed(providerInstanceFor(instanceId)),
  listInstances: Effect.succeed([]),
  listUnavailable: Effect.succeed([]),
  streamChanges: Stream.empty,
  subscribeChanges: Effect.never,
});

const layerProjects = Layer.mock(ProjectStore.ProjectStoreV2)({
  get: (id) =>
    Effect.succeed(
      Option.some({
        projectId: id,
        title: "Project",
        workspaceRoot: workspaceRoots.get(id) ?? "/unknown",
        defaultModelSelection: null,
        defaultThreadEnvMode: null,
        autoPull: false,
        faviconPath: null,
        projectIcon: null,
        scripts: [],
        createdAt: "2026-06-21T00:00:00.000Z",
        updatedAt: "2026-06-21T00:00:00.000Z",
        deletedAt: null,
      }),
    ),
});

const layerTest = RuntimePolicy.layerFromProjectStore.pipe(
  Layer.provide(layerProviderInstances),
  Layer.provide(layerProjects),
);

it.layer(layerTest)("RuntimePolicyV2", (it) => {
  it.effect("uses the project root for local-checkout threads", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const resolved = yield* policy.resolve({
        thread: makeThread({ now, worktreePath: null }),
        modelSelection,
      });
      assert.equal(resolved.cwd, "/project-root");
    }),
  );

  it.effect("prefers a provisioned worktree over the project root", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const resolved = yield* policy.resolve({
        thread: makeThread({ now, worktreePath: "/project-worktree" }),
        modelSelection,
      });
      assert.equal(resolved.cwd, "/project-worktree");
    }),
  );

  it.effect("runs a mode the provider does not offer in Supervised", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const modeFor = (instanceId: ProviderInstanceId, runtimeMode: RuntimeMode) =>
        policy
          .resolve({
            thread: makeThread({ now, worktreePath: null, runtimeMode }),
            modelSelection: { instanceId, model: "test-model" },
          })
          .pipe(Effect.map((resolved) => resolved.runtimeMode));

      assert.equal(yield* modeFor(grokInstanceId, "auto-accept-edits"), "approval-required");
      assert.equal(yield* modeFor(grokInstanceId, "auto"), "auto");
      assert.equal(yield* modeFor(grokInstanceId, "full-access"), "full-access");
      // A provider that advertises no restriction runs every mode as stored.
      assert.equal(yield* modeFor(providerInstanceId, "auto-accept-edits"), "auto-accept-edits");
    }),
  );
});

const studioProject: StudioProject = {
  name: "Test rig",
  template: "part",
  brief: {
    purpose: "Hold the sensor steady",
    requirements: "",
    units: "mm",
    material: "6061 aluminum",
    process: "CNC machining",
    quantity: "2",
    links: "",
    notes: "",
  },
  folders: ["/project-root/", "/project-cad", "/project-firmware"],
  createdAt: "2026-10-01T00:00:00.000Z",
};

const layerWithStudioProject = RuntimePolicy.layerFromProjectStore.pipe(
  Layer.provide(layerProviderInstances),
  Layer.provide(layerProjects),
  Layer.provide(ServerSettings.layerTest({ studioProjects: { rig: studioProject } })),
);

it.layer(layerWithStudioProject)("RuntimePolicyV2 Studio projects", (it) => {
  it.effect("gives a thread in a Studio project folder the other folders and the brief", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const resolved = yield* policy.resolve({
        thread: makeThread({ now, worktreePath: null }),
        modelSelection,
      });
      assert.equal(resolved.cwd, "/project-root");
      assert.deepEqual(resolved.additionalDirectories, ["/project-cad", "/project-firmware"]);
      assert.include(resolved.projectContext ?? "", "# Studio project: Test rig");
      assert.include(resolved.projectContext ?? "", "- Material: 6061 aluminum");
    }),
  );

  it.effect("matches a worktree thread by its project's folder", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const resolved = yield* policy.resolve({
        thread: makeThread({ now, worktreePath: "/project-worktree" }),
        modelSelection,
      });
      assert.equal(resolved.cwd, "/project-worktree");
      assert.deepEqual(resolved.additionalDirectories, ["/project-cad", "/project-firmware"]);
      assert.isDefined(resolved.projectContext);
    }),
  );

  it.effect("leaves both off for a thread whose folder is in no Studio project", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const resolved = yield* policy.resolve({
        thread: makeThread({ now, worktreePath: null, projectId: looseProjectId }),
        modelSelection,
      });
      assert.equal(resolved.cwd, "/loose-root");
      assert.notProperty(resolved, "additionalDirectories");
      assert.notProperty(resolved, "projectContext");
    }),
  );
});

const layerWithUnreadableSettings = RuntimePolicy.layerFromProjectStore.pipe(
  Layer.provide(layerProviderInstances),
  Layer.provide(layerProjects),
  Layer.provide(
    Layer.mock(ServerSettings.ServerSettingsService)({
      getSettings: Effect.fail(
        new ServerSettingsError({ settingsPath: "/settings.json", operation: "read-file" }),
      ),
    }),
  ),
);

it.layer(layerWithUnreadableSettings)("RuntimePolicyV2 unreadable settings", (it) => {
  it.effect("still resolves the turn without a Studio project", () =>
    Effect.gen(function* () {
      const policy = yield* RuntimePolicy.RuntimePolicyV2;
      const now = yield* DateTime.now;
      const resolved = yield* policy.resolve({
        thread: makeThread({ now, worktreePath: null }),
        modelSelection,
      });
      assert.equal(resolved.cwd, "/project-root");
      assert.notProperty(resolved, "additionalDirectories");
      assert.notProperty(resolved, "projectContext");
    }),
  );
});
