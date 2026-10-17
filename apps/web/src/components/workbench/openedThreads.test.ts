import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { threadToOpen, withOpened } from "./openedThreads";

const env = "local" as EnvironmentId;
const thread = (id: string, updatedAt: string) => ({
  environmentId: env,
  id: id as ThreadId,
  updatedAt,
});
const key = (id: string) => scopedThreadKey(scopeThreadRef(env, id as ThreadId));

describe("the thread opening a project goes back to", () => {
  const older = thread("older", "2026-10-10T09:00:00.000Z");
  const newer = thread("newer", "2026-10-12T09:00:00.000Z");

  it("is the one last open, though another was worked on since", () => {
    const opened = {
      [key("older")]: "2026-10-13T08:00:00.000Z",
      [key("newer")]: "2026-10-12T10:00:00.000Z",
    };
    expect(threadToOpen([older, newer], opened)).toBe(older);
  });

  it("is the one last worked on when none was opened here", () => {
    expect(threadToOpen([older, newer], {})).toBe(newer);
  });

  it("passes over a remembered thread the project no longer lists", () => {
    // Archived, deleted or another project's: only the live threads given can be opened.
    expect(threadToOpen([older, newer], { [key("gone")]: "2026-10-14T08:00:00.000Z" })).toBe(newer);
  });

  it("is none when the project has no thread, so a new one starts", () => {
    expect(threadToOpen([], { [key("older")]: "2026-10-13T08:00:00.000Z" })).toBeNull();
  });
});

describe("the threads remembered as opened", () => {
  it("keep the latest opening of each, forgetting the longest unopened past the limit", () => {
    let opened = {};
    opened = withOpened(opened, "a", "2026-10-01T00:00:00.000Z", 2);
    opened = withOpened(opened, "b", "2026-10-02T00:00:00.000Z", 2);
    opened = withOpened(opened, "a", "2026-10-03T00:00:00.000Z", 2);
    opened = withOpened(opened, "c", "2026-10-04T00:00:00.000Z", 2);
    expect(opened).toEqual({ a: "2026-10-03T00:00:00.000Z", c: "2026-10-04T00:00:00.000Z" });
  });
});
