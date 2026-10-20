import { describe, expect, it } from "vite-plus/test";

import { provisionalProjectName, setPendingStart, takePendingStart } from "./startProject";

describe("provisionalProjectName", () => {
  it("names a project from the start of its description", () => {
    expect(provisionalProjectName("A clip that holds a phone lanyard on my camera strap")).toBe(
      "Clip that holds a phone lanyard",
    );
  });

  it("drops a leading request and a dangling small word", () => {
    expect(provisionalProjectName("I need a bracket for the servo")).toBe("Bracket for the servo");
    expect(provisionalProjectName("Design an enclosure for a sensor board with")).toBe(
      "Enclosure for a sensor board",
    );
  });

  it("keeps to the first sentence", () => {
    expect(provisionalProjectName("Gear guard. It should be cheap.")).toBe("Gear guard");
  });

  it("falls back for an empty description", () => {
    expect(provisionalProjectName("   ")).toBe("New project");
    expect(provisionalProjectName("a")).toBe("New project");
  });
});

describe("takePendingStart", () => {
  it("hands the first message over once", () => {
    setPendingStart("/home/amy/projects/clip", { prompt: "A clip", files: [] });
    expect(takePendingStart("/home/amy/projects/clip/")?.prompt).toBe("A clip");
    expect(takePendingStart("/home/amy/projects/clip")).toBeNull();
  });

  it("keeps each folder's start apart", () => {
    setPendingStart("/p/one", { prompt: "One", files: [] });
    expect(takePendingStart("/p/two")).toBeNull();
    expect(takePendingStart("/p/one")?.prompt).toBe("One");
  });
});
