import type {
  EnvironmentProject,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/models";
import { describe, expect, it } from "vite-plus/test";

import type { ListedFolder, ListedProject } from "./projectList";
import { foldedStanding, SHOWN_CHATS, shownChats, sidebarProjects } from "./sidebarProjects";

const folder = (id: string) =>
  ({ id, environmentId: "local", workspaceRoot: `/work/${id}` }) as unknown as EnvironmentProject;
const chat = (id: string, updatedAt = "2026-11-01T00:00:00.000Z", extra = {}) =>
  ({
    id,
    updatedAt,
    archivedAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    latestRun: null,
    runtime: null,
    ...extra,
  }) as unknown as EnvironmentThreadShell;
const card = (id: string, latest: string, opened: string | null = null) =>
  ({
    id,
    project: { name: id, folders: [`/work/${id}`] },
    folder: folder(id),
    folders: [folder(id)],
    threads: [],
    latest,
    opened,
  }) as unknown as ListedProject;
const loose = (id: string, threads: EnvironmentThreadShell[]) =>
  ({ folder: folder(id), threads, latest: "2026-01-01" }) as unknown as ListedFolder;
const none = { cards: [], loose: [], unfiled: [], freeFolderId: null, currentFolderId: null };

describe("sidebarProjects", () => {
  it("orders projects by work, so opening one leaves the rows where they are", () => {
    const entries = sidebarProjects({
      ...none,
      cards: [card("opened-just-now", "2026-01-01", "2026-11-05"), card("worked-on", "2026-10-01")],
    });
    expect(entries.map((entry) => entry.id)).toEqual(["worked-on", "opened-just-now"]);
  });

  it("lists a folder in no project with a chat, or open, and its older chats last", () => {
    const entries = sidebarProjects({
      ...none,
      cards: [card("bracket", "2026-10-01")],
      loose: [
        loose("with-chats", [chat("a")]),
        loose("empty", []),
        loose("open-empty", []),
        loose("free", [chat("b")]),
      ],
      unfiled: [chat("b")],
      freeFolderId: "free",
      currentFolderId: "open-empty",
    });
    expect(entries.map((entry) => entry.name)).toEqual([
      "Bracket",
      "With chats",
      "Open empty",
      "No project",
    ]);
    expect(entries.at(-1)?.folder).toBeNull();
  });
});

describe("shownChats", () => {
  const chats = Array.from({ length: SHOWN_CHATS + 3 }, (_, index) =>
    chat(`c${index}`, `2026-10-${String(20 - index).padStart(2, "0")}`),
  );

  it("cuts a long list to the newest and says how many are left", () => {
    const { chats: shown, hidden } = shownChats(chats, null, false);
    expect(shown.map((each) => each.id)).toEqual(["c0", "c1", "c2", "c3", "c4"]);
    expect(hidden).toBe(3);
  });

  it("keeps the open chat in the list, however old", () => {
    const { chats: shown, hidden } = shownChats(chats, "c7", false);
    expect(shown.map((each) => each.id)).toContain("c7");
    expect([shown.length, hidden]).toEqual([SHOWN_CHATS, 3]);
  });

  it("shows them all when asked, with none left", () => {
    expect(shownChats(chats, null, true).hidden).toBe(0);
  });
});

describe("foldedStanding", () => {
  it("says a chat needs the person ahead of one at work, and nothing of quiet chats", () => {
    const asking = chat("asking", undefined, { hasPendingApprovals: true });
    expect(foldedStanding([chat("quiet"), asking])?.text).toBe("Needs you");
    expect(foldedStanding([chat("quiet")])).toBeNull();
  });
});
