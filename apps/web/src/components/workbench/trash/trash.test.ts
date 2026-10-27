import type { StudioProject, StudioTrashedProject } from "@t3tools/contracts";
import { EMPTY_STUDIO_BRIEF } from "@t3tools/shared/studioProjects";
import { describe, expect, it } from "vite-plus/test";

import {
  deleteForever,
  hiddenByTrash,
  inTrashOrder,
  trashOnlyFolders,
  trashWithUndo,
  withoutTrashedFolders,
} from "./trash";

const project = (name: string, folders: ReadonlyArray<string>): StudioProject => ({
  name,
  template: "part",
  brief: EMPTY_STUDIO_BRIEF,
  folders,
  createdAt: "2026-10-01T00:00:00.000Z",
});
const trashed = (
  name: string,
  folders: ReadonlyArray<string>,
  trashedAt = "2026-10-26T00:00:00.000Z",
): StudioTrashedProject => ({ ...project(name, folders), trashedAt });

const folders = [
  { id: "f-stand", workspaceRoot: "/work/phone-stand" },
  { id: "f-lamp", workspaceRoot: "/work/desk-lamp/" },
  { id: "f-shared", workspaceRoot: "/work/shared" },
];
const chats = [
  { id: "c1", projectId: "f-stand" },
  { id: "c2", projectId: "f-lamp" },
  { id: "c3", projectId: "f-shared" },
];

describe("hiddenByTrash", () => {
  it("hides the folders only projects in Trash hold, with their chats", () => {
    const shown = hiddenByTrash(
      folders,
      chats,
      { lamp: trashed("Desk lamp", ["/work/desk-lamp", "/work/shared"]) },
      { stand: project("Phone stand", ["/work/phone-stand", "/work/shared"]) },
    );
    // The shared folder stays: a project not in Trash still holds it.
    expect(shown.folders.map((folder) => folder.id)).toEqual(["f-stand", "f-shared"]);
    expect(shown.chats.map((chat) => chat.id)).toEqual(["c1", "c3"]);
  });

  it("shows everything, as given, with nothing in Trash", () => {
    const shown = hiddenByTrash(folders, chats, {}, {});
    expect(shown.folders).toBe(folders);
    expect(shown.chats).toBe(chats);
  });
});

describe("inTrashOrder", () => {
  it("lists the last moved to Trash first", () => {
    expect(
      inTrashOrder({
        a: trashed("Old", [], "2026-10-01T00:00:00.000Z"),
        b: trashed("New", [], "2026-10-20T00:00:00.000Z"),
      }).map((entry) => entry.id),
    ).toEqual(["b", "a"]);
  });
});

/** The server's two lists as a fake: Trash moves a record between them, keeping its id. */
function fakeStudio(projects: Record<string, StudioProject>) {
  const state = {
    projects: { ...projects } as Record<string, StudioProject>,
    trashed: {} as Record<string, StudioTrashedProject>,
  };
  return {
    state,
    trash: async (id: string) => {
      const found = state.projects[id];
      if (found === undefined) return false;
      delete state.projects[id];
      state.trashed[id] = { ...found, trashedAt: "2026-10-26T00:00:00.000Z" };
      return true;
    },
    restore: async (id: string) => {
      const found = state.trashed[id];
      if (found === undefined) return false;
      delete state.trashed[id];
      const { trashedAt: _trashedAt, ...back } = found;
      state.projects[id] = back;
      return true;
    },
    purge: async (id: string) => {
      if (state.trashed[id] === undefined) return false;
      delete state.trashed[id];
      return true;
    },
  };
}

describe("trashWithUndo", () => {
  it("says it moved the project, and Undo brings it back exactly, chats listed again", async () => {
    const stand = project("Phone stand", ["/work/phone-stand"]);
    const studio = fakeStudio({ stand });
    const said: Array<{ title: string; undo: () => Promise<boolean> }> = [];

    expect(
      await trashWithUndo({
        id: "stand",
        name: "Phone stand",
        ...studio,
        say: (t) => said.push(t),
      }),
    ).toBe(true);
    expect(said.map((toast) => toast.title)).toEqual(["Moved Phone stand to Trash"]);
    expect(
      hiddenByTrash(folders, chats, studio.state.trashed, studio.state.projects).chats,
    ).toEqual([chats[1], chats[2]]);

    expect(await said[0]!.undo()).toBe(true);
    expect(studio.state.projects).toEqual({ stand });
    expect(studio.state.trashed).toEqual({});
    expect(hiddenByTrash(folders, chats, studio.state.trashed, studio.state.projects).chats).toBe(
      chats,
    );
  });

  it("says nothing when the move fails", async () => {
    const said: unknown[] = [];
    const studio = fakeStudio({});
    expect(
      await trashWithUndo({ id: "gone", name: "Gone", ...studio, say: (t) => said.push(t) }),
    ).toBe(false);
    expect(said).toEqual([]);
  });
});

describe("deleteForever", () => {
  it("deletes the folders only it holds, then its record, keeping a folder another holds", async () => {
    const studio = fakeStudio({ stand: project("Phone stand", ["/work/shared"]) });
    await studio.trash("stand");
    studio.state.trashed.lamp = trashed("Desk lamp", ["/work/desk-lamp", "/work/shared"]);
    const deleted: string[] = [];

    const done = await deleteForever({
      id: "lamp",
      projects: {},
      trashed: studio.state.trashed,
      knownFolders: folders,
      deleteFolder: async (folder) => {
        deleted.push(folder.id);
        return true;
      },
      purge: studio.purge,
    });

    expect(done).toBe(true);
    // The shared folder is the trashed Phone stand's too: its chats stay for a restore.
    expect(deleted).toEqual(["f-lamp"]);
    expect(Object.keys(studio.state.trashed)).toEqual(["stand"]);
  });

  it("still deletes the record when its folder is already gone", async () => {
    const studio = fakeStudio({ gone: project("Gone", ["/work/removed-already"]) });
    await studio.trash("gone");
    const deleted: string[] = [];

    const done = await deleteForever({
      id: "gone",
      projects: {},
      trashed: studio.state.trashed,
      knownFolders: folders,
      deleteFolder: async (folder) => {
        deleted.push(folder.id);
        return true;
      },
      purge: studio.purge,
    });

    expect(done).toBe(true);
    expect(deleted).toEqual([]);
    expect(studio.state.trashed).toEqual({});
  });

  it("keeps the record, to try again, when a folder could not be deleted", async () => {
    const studio = fakeStudio({ stand: project("Phone stand", ["/work/phone-stand"]) });
    await studio.trash("stand");
    const done = await deleteForever({
      id: "stand",
      projects: {},
      trashed: studio.state.trashed,
      knownFolders: folders,
      deleteFolder: async () => false,
      purge: studio.purge,
    });
    expect(done).toBe(false);
    expect(Object.keys(studio.state.trashed)).toEqual(["stand"]);
  });
});

describe("withoutTrashedFolders", () => {
  const palette = [
    { id: "p-stand", environmentId: "local", workspaceRoot: "/work/phone-stand" },
    { id: "p-lamp", environmentId: "local", workspaceRoot: "/work/desk-lamp/" },
    { id: "p-lamp", environmentId: "remote", workspaceRoot: "/work/desk-lamp" },
  ];
  const threads = [
    { environmentId: "local", projectId: "p-stand" },
    { environmentId: "local", projectId: "p-lamp" },
    { environmentId: "remote", projectId: "p-lamp" },
  ];
  const hidden = trashOnlyFolders({ lamp: trashed("Desk lamp", ["/work/desk-lamp"]) }, {});

  it("drops the trashed folders and their threads on that environment only", () => {
    const shown = withoutTrashedFolders(palette, threads, hidden, "local");
    expect(shown.projects.map((p) => `${p.environmentId}:${p.id}`)).toEqual([
      "local:p-stand",
      "remote:p-lamp",
    ]);
    expect(shown.threads.map((t) => `${t.environmentId}:${t.projectId}`)).toEqual([
      "local:p-stand",
      "remote:p-lamp",
    ]);
  });

  it("returns the lists as given when nothing is hidden or no environment is known", () => {
    expect(withoutTrashedFolders(palette, threads, new Set(), "local").projects).toBe(palette);
    expect(withoutTrashedFolders(palette, threads, hidden, null).threads).toBe(threads);
  });
});
