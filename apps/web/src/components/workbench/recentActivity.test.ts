import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import type { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { homeRecent, needsYou, recentChats } from "./recentActivity";
import type { ListedProject } from "./projectList";

const env = "local" as EnvironmentId;
const thread = (id: string, updatedAt: string, waiting = false) =>
  ({
    id,
    environmentId: env,
    title: id,
    updatedAt,
    archivedAt: null,
    runtime: null,
    latestRun: null,
    hasPendingApprovals: waiting,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  }) as unknown as EnvironmentThreadShell;
const card = (id: string, threads: EnvironmentThreadShell[]) =>
  ({ id, threads, project: { name: id } }) as unknown as ListedProject;
const key = (id: string) => scopedThreadKey(scopeThreadRef(env, id as never));

const roomba = card("roomba", [thread("bumper", "2026-10-20T10:00:00.000Z", true)]);
const lamp = card("lamp", [thread("shade", "2026-10-19T10:00:00.000Z")]);

describe("home activity", () => {
  it("leads with the chats opened lately in every project, the open one left out", () => {
    const opened = {
      [key("bumper")]: "2026-10-21T09:00:00.000Z",
      [key("shade")]: "2026-10-21T08:00:00.000Z",
    };
    // In the lamp's chat, the one before is the roomba's, though it is in another project.
    expect(
      recentChats([roomba, lamp], opened, "shade").map(({ card, thread }) => [card.id, thread.id]),
    ).toEqual([["roomba", "bumper"]]);
    expect(recentChats([roomba, lamp], opened, null).map(({ thread }) => thread.id)).toEqual([
      "bumper",
      "shade",
    ]);
    // A chat never opened on this device is not among them.
    expect(recentChats([roomba, lamp], {}, null)).toEqual([]);
  });

  it("lists what was opened lately across projects, chats and files, newest first", () => {
    const recent = homeRecent(
      [roomba, lamp],
      { [key("bumper")]: "2026-10-21T09:00:00.000Z", [key("shade")]: "2026-10-21T08:00:00.000Z" },
      [
        {
          environmentId: env,
          threadId: "shade",
          path: "parts/shade.step",
          at: "2026-10-21T09:30:00.000Z",
        },
        {
          environmentId: env,
          threadId: "gone",
          path: "parts/x.step",
          at: "2026-10-21T10:00:00.000Z",
        },
      ],
    );
    expect(
      recent.map((item) => [
        item.kind,
        item.card.id,
        item.kind === "file" ? item.file.path : item.thread.id,
      ]),
    ).toEqual([
      ["file", "lamp", "parts/shade.step"],
      ["chat", "roomba", "bumper"],
      ["chat", "lamp", "shade"],
    ]);
  });

  it("finds the chats waiting on the person, in any project", () => {
    expect(needsYou([roomba, lamp]).map(({ thread: waiting }) => waiting.id)).toEqual(["bumper"]);
  });
});
