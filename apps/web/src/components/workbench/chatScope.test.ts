import { beforeEach, describe, expect, it } from "vite-plus/test";

import { projectOpen, useChatScopeStore } from "./chatScope";

const scope = () => useChatScopeStore.getState();

beforeEach(() => {
  useChatScopeStore.setState({ opened: [], foldedActive: null });
});

describe("which projects show their chats", () => {
  it("opens the active project alone, without keeping it open once left", () => {
    expect(projectOpen(scope(), "a", true)).toBe(true);
    expect(projectOpen(scope(), "b", false)).toBe(false);
    scope().arrive();
    expect(scope().opened).toEqual([]);
  });

  it("keeps a project opened by hand open after moving elsewhere", () => {
    scope().toggle("b", false);
    expect(projectOpen(scope(), "b", false)).toBe(true);
    scope().toggle("b", false);
    expect(projectOpen(scope(), "b", false)).toBe(false);
  });

  it("lets the active project be folded, and opens it again on the next arrival", () => {
    scope().toggle("a", true);
    expect(projectOpen(scope(), "a", true)).toBe(false);
    scope().toggle("a", true);
    expect(projectOpen(scope(), "a", true)).toBe(true);
    scope().toggle("a", true);
    scope().toggle("a", true);
    scope().toggle("a", true);
    scope().arrive();
    expect(projectOpen(scope(), "a", true)).toBe(true);
  });

  it("folds the active project even when it had been opened by hand", () => {
    scope().toggle("b", false);
    scope().toggle("b", true);
    expect(projectOpen(scope(), "b", true)).toBe(false);
  });
});
