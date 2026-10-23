import { describe, expect, it } from "vite-plus/test";

import { askMessage, noProjectChats } from "./freeformChat";

const FOLDER = "/Users/sam/studio-projects";

describe("a chat in no project", () => {
  it("asks first, then tells the agent it is in no project and where the projects are", () => {
    const message = askMessage({
      question: "  What wall did I give the hinge bracket?  ",
      projectsFolder: FOLDER,
      paths: [],
      attached: 0,
    });
    const [first, , note] = message.split("\n");
    expect(first).toBe("What wall did I give the hinge bracket?");
    expect(note).toContain("in no project");
    expect(note).toContain(`\`${FOLDER}\``);
    expect(note).toContain("anywhere on this computer");
  });

  it("names files on this computer by their paths, and asks about attached files on their own", () => {
    expect(
      askMessage({
        question: "Is this one of mine?",
        projectsFolder: FOLDER,
        paths: ["/Users/sam/Downloads/clip.step"],
        attached: 0,
      }),
    ).toContain("My files:\n- `/Users/sam/Downloads/clip.step`");
    expect(
      askMessage({ question: "", projectsFolder: FOLDER, paths: [], attached: 1 }).split("\n")[0],
    ).toBe("Look at the file I attached.");
    expect(
      askMessage({ question: "", projectsFolder: FOLDER, paths: ["/a", "/b"], attached: 0 }).split(
        "\n",
      )[0],
    ).toBe("Look at the files I attached.");
  });

  it("lists only the chats in the projects' folder, on this environment", () => {
    const thread = (id: string, environmentId: string, projectId: string) =>
      ({ id, environmentId, projectId }) as never;
    const threads = [
      thread("a", "env", "free"),
      thread("b", "env", "bracket"),
      thread("c", "other", "free"),
    ];
    expect(
      noProjectChats(threads, "env" as never, "free").map((each: { id: string }) => each.id),
    ).toEqual(["a"]);
    expect(noProjectChats(threads, "env" as never, null)).toEqual([]);
  });
});
