import { describe, expect, it } from "vite-plus/test";

import { splitSources } from "./answerSources";

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

  it("cuts a description after the target", () => {
    const answer = [
      "Sources:",
      "[1] parts/bracket.py:12-18 — the hole pattern",
      "[2] docs/prd.md#Scope – what we make",
      "[3] https://example.com/page - the vendor's page",
      "[4] https://example.com/a?b=c and more words",
      "[5] own knowledge: ISO 273 — clearance holes",
    ].join("\n");
    expect(splitSources(answer).sources).toEqual([
      { n: 1, target: { kind: "file", path: "parts/bracket.py", lines: [12, 18], heading: null } },
      { n: 2, target: { kind: "file", path: "docs/prd.md", lines: null, heading: "Scope" } },
      { n: 3, target: { kind: "url", url: "https://example.com/page" } },
      { n: 4, target: { kind: "url", url: "https://example.com/a?b=c" } },
      { n: 5, target: { kind: "own", text: "ISO 273" } },
    ]);
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
