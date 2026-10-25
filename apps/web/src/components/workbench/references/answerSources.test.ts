import type { StudioProject } from "@t3tools/contracts";
import { EMPTY_STUDIO_BRIEF, studioProjectContext } from "@t3tools/shared/studioProjects";
import { describe, expect, it } from "vite-plus/test";

import { splitSources } from "./answerSources";

const rover: StudioProject = {
  name: "Rover arm",
  template: "robot",
  brief: EMPTY_STUDIO_BRIEF,
  folders: ["/work/rover-cad"],
  createdAt: "2026-10-14T00:00:00.000Z",
};

describe("splitSources", () => {
  it("reads the four kinds", () => {
    // The block as `studioProjectContext` tells the agent to write it.
    const answer = [
      "The holes are 3.4 mm [1], sized for the M3 screws the brief names [2]. The vendor agrees [3], and it is the usual fit [4].",
      "",
      "Sources:",
      "[1] path/to/file.py:12-18",
      "[2] docs/prd.md#The heading",
      "[3] https://example.com/page",
      "[4] own knowledge: what it is",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "file", path: "path/to/file.py", lines: [12, 18], heading: null } },
      { n: 2, target: { kind: "file", path: "docs/prd.md", lines: null, heading: "The heading" } },
      { n: 3, target: { kind: "url", url: "https://example.com/page" } },
      { n: 4, target: { kind: "own", text: "what it is" } },
    ]);
  });

  it("strips the block from the answer", () => {
    const answer =
      "The hole is 3.4 mm [1].\n\nIt takes an M3 screw.\n\nSources:\n\n[1] parts/bracket.py:12-18\n\n";
    expect(splitSources(answer)).toEqual({
      body: "The hole is 3.4 mm [1].\n\nIt takes an M3 screw.",
      sources: [
        {
          n: 1,
          target: { kind: "file", path: "parts/bracket.py", lines: [12, 18], heading: null },
        },
      ],
    });
  });

  it("keeps the answer's Windows line ends when it strips the block", () => {
    expect(splitSources("One.\r\nTwo [1].\r\n\r\nSources:\r\n[1] parts/bracket.py\r\n")).toEqual({
      body: "One.\r\nTwo [1].",
      sources: [
        { n: 1, target: { kind: "file", path: "parts/bracket.py", lines: null, heading: null } },
      ],
    });
  });

  it("keeps an answer with no block as it is", () => {
    const answer = "The hole is 3.4 mm [1].\n\n- one\n- two\n\n";
    expect(splitSources(answer)).toEqual({ body: answer, sources: [] });
    expect(splitSources("")).toEqual({ body: "", sources: [] });
  });

  it("drops a line it cannot read", () => {
    const answer = [
      "Both fit [1] [2].",
      "",
      "Sources:",
      "[x] parts/a.py",
      "[3]",
      "[0] parts/zero.py",
      "[4] #Heading with no file",
      "[1] parts/bracket.py:12-18",
      "[see above] docs/prd.md",
      "[5](https://example.com/page)",
      "[2] docs/prd.md",
    ].join("\n");
    expect(splitSources(answer)).toEqual({
      body: "Both fit [1] [2].",
      sources: [
        {
          n: 1,
          target: { kind: "file", path: "parts/bracket.py", lines: [12, 18], heading: null },
        },
        { n: 2, target: { kind: "file", path: "docs/prd.md", lines: null, heading: null } },
      ],
    });
  });

  it("keeps the first of a number that repeats", () => {
    const answer =
      "Both [1] [2].\n\nSources:\n[1] parts/bracket.py\n[2] docs/prd.md\n[1] docs/other.md";
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "file", path: "parts/bracket.py", lines: null, heading: null } },
      { n: 2, target: { kind: "file", path: "docs/prd.md", lines: null, heading: null } },
    ]);
  });

  it("reads only a final block", () => {
    // A Sources line with words under it is text.
    const words = "Sources:\nThese are the ones I used.";
    expect(splitSources(words)).toEqual({ body: words, sources: [] });
    // A list in the middle is text, whatever the answer says after it.
    const middle = "Sources:\n[1] parts/bracket.py\n\nThat is what I found.";
    expect(splitSources(middle)).toEqual({ body: middle, sources: [] });
    // With two, the last is the block and the first stays in the answer.
    expect(splitSources("Sources:\nSee below.\n\nSources:\n[1] parts/bracket.py")).toEqual({
      body: "Sources:\nSee below.",
      sources: [
        { n: 1, target: { kind: "file", path: "parts/bracket.py", lines: null, heading: null } },
      ],
    });
  });

  it("reads a bold header with bulleted lines", () => {
    expect(
      splitSources(
        "It fits [1].\n\n**Sources:**\n- [1] parts/bracket.py:12\n* [2] https://example.com/page",
      ),
    ).toEqual({
      body: "It fits [1].",
      sources: [
        {
          n: 1,
          target: { kind: "file", path: "parts/bracket.py", lines: [12, 12], heading: null },
        },
        { n: 2, target: { kind: "url", url: "https://example.com/page" } },
      ],
    });
  });

  it("strips a Sources line with nothing under it", () => {
    expect(splitSources("It fits.\n\nSources:\n\n")).toEqual({ body: "It fits.", sources: [] });
  });

  it.each([
    "Sources:",
    "Sources",
    "  Sources:  ",
    "**Sources:**",
    "**Sources**:",
    "**Sources**",
    "__Sources:__",
    "_Sources:_",
    "## Sources",
    "### Sources:",
    "## **Sources:**",
  ])("takes %j as the header", (header) => {
    expect(splitSources(`Done.\n\n${header}\n[1] a.py`)).toEqual({
      body: "Done.",
      sources: [{ n: 1, target: { kind: "file", path: "a.py", lines: null, heading: null } }],
    });
  });

  it.each(["sources:", "SOURCES:", "Sources used:", "Sources: [1] a.py", "**Sources:"])(
    "does not take %j for the header",
    (line) => {
      const answer = `Done.\n\n${line}\n[1] a.py`;
      expect(splitSources(answer)).toEqual({ body: answer, sources: [] });
    },
  );

  it("reads a file's lines and heading as written", () => {
    const answer = [
      "Sources:",
      "[1] parts/bracket.py:12",
      "[2] parts/bracket.py:18-12",
      "[3] /Users/amy/rover/parts/bracket.py:12-18",
      "[4] C:\\work\\rover\\parts\\bracket.py:12-18",
      "[5] parts/bracket.py",
      "[6] docs/prd.md#Scope: what we make",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "file", path: "parts/bracket.py", lines: [12, 12], heading: null } },
      { n: 2, target: { kind: "file", path: "parts/bracket.py", lines: [12, 18], heading: null } },
      {
        n: 3,
        target: {
          kind: "file",
          path: "/Users/amy/rover/parts/bracket.py",
          lines: [12, 18],
          heading: null,
        },
      },
      {
        n: 4,
        target: {
          kind: "file",
          path: "C:\\work\\rover\\parts\\bracket.py",
          lines: [12, 18],
          heading: null,
        },
      },
      { n: 5, target: { kind: "file", path: "parts/bracket.py", lines: null, heading: null } },
      {
        n: 6,
        target: { kind: "file", path: "docs/prd.md", lines: null, heading: "Scope: what we make" },
      },
    ]);
  });

  it("cuts a description after a plain path or an address", () => {
    const answer = [
      "Sources:",
      "[1] parts/bracket.py:12-18 — the hole pattern",
      "[2] docs/prd.md – what we make",
      "[3] https://example.com/page - the vendor's page",
      "[4] https://example.com/a?b=c and more words",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "file", path: "parts/bracket.py", lines: [12, 18], heading: null } },
      { n: 2, target: { kind: "file", path: "docs/prd.md", lines: null, heading: null } },
      { n: 3, target: { kind: "url", url: "https://example.com/page" } },
      { n: 4, target: { kind: "url", url: "https://example.com/a?b=c" } },
    ]);
  });

  it("keeps the rest of the line for a heading and for own knowledge", () => {
    const answer = [
      "Sources:",
      "[1] docs/prd.md#Fits - clearance",
      "[2] docs/prd.md#Scope – what we make",
      "[3] own knowledge: ISO 2768 - tolerances",
      "[4] own knowledge: ISO 273 — clearance holes",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      {
        n: 1,
        target: { kind: "file", path: "docs/prd.md", lines: null, heading: "Fits - clearance" },
      },
      {
        n: 2,
        target: { kind: "file", path: "docs/prd.md", lines: null, heading: "Scope – what we make" },
      },
      { n: 3, target: { kind: "own", text: "ISO 2768 - tolerances" } },
      { n: 4, target: { kind: "own", text: "ISO 273 — clearance holes" } },
    ]);
  });

  it("reads a link to anything but a web page as a file", () => {
    const answer = [
      "Sources:",
      "[1] [bracket](parts/bracket.py:12-18)",
      "[2] [the scope](docs/prd.md#Scope) — what we make",
      "[3] [Servo bracket](./parts/servo_bracket.py)",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "file", path: "parts/bracket.py", lines: [12, 18], heading: null } },
      { n: 2, target: { kind: "file", path: "docs/prd.md", lines: null, heading: "Scope" } },
      {
        n: 3,
        target: { kind: "file", path: "./parts/servo_bracket.py", lines: null, heading: null },
      },
    ]);
  });

  it("leaves the backticks out of a path, wherever they sit", () => {
    const answer = [
      "Sources:",
      "[1] `a.py`:12-18",
      "[2] `docs/prd.md`#Scope",
      "[3] parts/`bracket.py`",
      "[4] docs/prd.md#The `foo` option",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "file", path: "a.py", lines: [12, 18], heading: null } },
      { n: 2, target: { kind: "file", path: "docs/prd.md", lines: null, heading: "Scope" } },
      { n: 3, target: { kind: "file", path: "parts/bracket.py", lines: null, heading: null } },
      {
        n: 4,
        target: { kind: "file", path: "docs/prd.md", lines: null, heading: "The `foo` option" },
      },
    ]);
  });

  it("reads a colon after the number as the footnote style, with or without a space", () => {
    const answer = [
      "Sources:",
      "[1]: https://example.com/page",
      "- [2]: parts/bracket.py:12-18",
      "[3]:https://example.com/spec",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "url", url: "https://example.com/page" } },
      { n: 2, target: { kind: "file", path: "parts/bracket.py", lines: [12, 18], heading: null } },
      { n: 3, target: { kind: "url", url: "https://example.com/spec" } },
    ]);
  });

  it("takes a # for a heading mark only when it follows the path directly", () => {
    const answer = [
      "Sources:",
      "[1] docs/Design - Notes.md#Scope",
      "[2] docs/fasteners.md:12 — #6-32 clearance hole",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      {
        n: 1,
        target: { kind: "file", path: "docs/Design - Notes.md", lines: null, heading: "Scope" },
      },
      { n: 2, target: { kind: "file", path: "docs/fasteners.md", lines: [12, 12], heading: null } },
    ]);
  });

  it("reads a line range written with an en or an em dash", () => {
    const answer = ["Sources:", "[1] a.py:12–18", "[2] a.py:12—18"].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "file", path: "a.py", lines: [12, 18], heading: null } },
      { n: 2, target: { kind: "file", path: "a.py", lines: [12, 18], heading: null } },
    ]);
  });

  it("cuts a note in parentheses, or after a colon, from a plain path", () => {
    const answer = [
      "Sources:",
      "[1] a.py:12-18 (the hole)",
      "[2] a.py (the hole)",
      "[3] a.py:12-18: the hole",
      "[4] a.py:12-18 (the hole - 3 mm)",
      "[5] docs/Design notes (v2).md",
      "[6] docs/Design notes (v2)",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "file", path: "a.py", lines: [12, 18], heading: null } },
      { n: 2, target: { kind: "file", path: "a.py", lines: null, heading: null } },
      { n: 3, target: { kind: "file", path: "a.py", lines: [12, 18], heading: null } },
      { n: 4, target: { kind: "file", path: "a.py", lines: [12, 18], heading: null } },
      {
        n: 5,
        target: { kind: "file", path: "docs/Design notes (v2).md", lines: null, heading: null },
      },
      {
        n: 6,
        target: { kind: "file", path: "docs/Design notes (v2)", lines: null, heading: null },
      },
    ]);
  });

  it("leaves a column after the line out of the path", () => {
    expect(splitSources("Sources:\n[1] src/a.ts:42:7").sources).toEqual([
      { n: 1, target: { kind: "file", path: "src/a.ts", lines: [42, 42], heading: null } },
    ]);
  });

  it("reads a link followed by punctuation as the link", () => {
    const answer = [
      "Sources:",
      "[1] [Torx](https://example.com/t).",
      "[2] [Torx](https://example.com/t),",
      "[3] [Torx](https://example.com/t);",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "url", url: "https://example.com/t" } },
      { n: 2, target: { kind: "url", url: "https://example.com/t" } },
      { n: 3, target: { kind: "url", url: "https://example.com/t" } },
    ]);
  });

  it("drops one leading separator from own knowledge", () => {
    const answer = [
      "Sources:",
      "[1] own knowledge — ISO 2768",
      "[2] own knowledge – ISO 2768",
      "[3] own knowledge - ISO 2768",
      "[4] own knowledge: ISO 2768",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "own", text: "ISO 2768" } },
      { n: 2, target: { kind: "own", text: "ISO 2768" } },
      { n: 3, target: { kind: "own", text: "ISO 2768" } },
      { n: 4, target: { kind: "own", text: "ISO 2768" } },
    ]);
  });

  it("takes line 0 for no line", () => {
    const answer = ["Sources:", "[1] a.py:0", "[2] a.py:0-5"].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "file", path: "a.py", lines: null, heading: null } },
      { n: 2, target: { kind: "file", path: "a.py", lines: null, heading: null } },
    ]);
  });

  it.each(["---", "***", "___"])(
    "drops a %s rule right before the Sources line, with the blank lines around it",
    (rule) => {
      expect(splitSources(`text\n\n${rule}\n\nSources:\n[1] a.py`)).toEqual({
        body: "text",
        sources: [{ n: 1, target: { kind: "file", path: "a.py", lines: null, heading: null } }],
      });
    },
  );

  it("keeps a rule that is not right before the Sources line", () => {
    expect(splitSources("one\n\n---\n\ntwo\n\nSources:\n[1] a.py").body).toBe("one\n\n---\n\ntwo");
  });

  it("leaves an answer whole when a closed code fence at its end shows the format", () => {
    const answer =
      "To cite, end the answer like this:\n\n```text\nSources:\n[1] parts/bracket.py:12-18\n```";
    expect(splitSources(answer)).toEqual({ body: answer, sources: [] });
    expect(splitSources(`${answer}\n`)).toEqual({ body: `${answer}\n`, sources: [] });
  });

  it("reads the example lines the agent is given, so the instruction and the reader agree", () => {
    const context = studioProjectContext(rover, "/work/rover-cad");
    const example = context
      .slice(context.indexOf("one source a line:") + "one source a line:".length)
      .split("Cite only")[0]
      ?.trim()
      .split("\n");
    expect(example).toHaveLength(4);
    expect(splitSources(["Done.", "", "Sources:", ...(example ?? [])].join("\n"))).toEqual({
      body: "Done.",
      sources: [
        { n: 1, target: { kind: "file", path: "path/to/file.py", lines: [12, 18], heading: null } },
        {
          n: 2,
          target: { kind: "file", path: "docs/prd.md", lines: null, heading: "The heading" },
        },
        { n: 3, target: { kind: "url", url: "https://example.com/page" } },
        { n: 4, target: { kind: "own", text: "what it is" } },
      ],
    });
  });

  it("reads a target in backticks, in angle brackets or as a link, whole", () => {
    const answer = [
      "Sources:",
      "[1] `parts/bracket.py:12` — the hole",
      "[2] <https://example.com/spec>",
      "[3] `docs/ISO 2768 - tolerances.pdf`",
      "[4] [Torx - Wikipedia](https://example.com/wiki/Torx_(screw_drive)) — the drive",
      "[5] [The spec](https://example.com/spec#clearance)",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "file", path: "parts/bracket.py", lines: [12, 12], heading: null } },
      { n: 2, target: { kind: "url", url: "https://example.com/spec" } },
      {
        n: 3,
        target: {
          kind: "file",
          path: "docs/ISO 2768 - tolerances.pdf",
          lines: null,
          heading: null,
        },
      },
      { n: 4, target: { kind: "url", url: "https://example.com/wiki/Torx_(screw_drive)" } },
      { n: 5, target: { kind: "url", url: "https://example.com/spec#clearance" } },
    ]);
  });

  it("reads own knowledge in any case, with or without its words", () => {
    const answer = [
      "Sources:",
      "[1] Own knowledge: M3 clearance is 3.4 mm",
      "[2] OWN KNOWLEDGE",
      "[3] own knowledge a standard I know",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "own", text: "M3 clearance is 3.4 mm" } },
      { n: 2, target: { kind: "own", text: "" } },
      { n: 3, target: { kind: "own", text: "a standard I know" } },
    ]);
  });
});
