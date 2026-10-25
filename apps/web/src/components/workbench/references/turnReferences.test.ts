import { MessageId, RunId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { TimelineEntry } from "~/session-logic";
import {
  computeStableMessagesTimelineRows,
  deriveMessagesTimelineRows,
} from "../../chat/MessagesTimeline.logic";
import {
  openedInChat,
  referenceLabel,
  referencesEqual,
  turnReferences,
  type AnswerReference,
} from "./turnReferences";

const run1 = RunId.make("run-1");
const run2 = RunId.make("run-2");
const run3 = RunId.make("run-3");

/** A chat as the timeline holds it: each entry a second after the one before. */
function makeChat() {
  let count = 0;
  const stamp = () => {
    count += 1;
    return new Date(Date.UTC(2026, 9, 24, 9, 0, count)).toISOString();
  };
  const message = (
    role: "user" | "assistant",
    runId: RunId | null,
    text: string,
    streaming = false,
  ): TimelineEntry => {
    const createdAt = stamp();
    return {
      id: `entry-${count}`,
      kind: "message",
      createdAt,
      message: {
        id: MessageId.make(`message-${count}`),
        role,
        text,
        runId,
        streaming,
        createdAt,
        updatedAt: createdAt,
      },
    };
  };
  const tool = (runId: RunId | null, item: Record<string, unknown>): TimelineEntry => {
    const createdAt = stamp();
    return {
      id: `entry-${count}`,
      kind: "work",
      createdAt,
      entry: {
        id: `item-${count}`,
        createdAt,
        runId,
        label: "Tool call",
        tone: "tool",
        structuredPayload: { status: "completed", ...item } as never,
      },
    };
  };
  return {
    user: (runId: RunId | null, text = "A question") => message("user", runId, text),
    assistant: (runId: RunId | null, text: string, streaming = false) =>
      message("assistant", runId, text, streaming),
    tool,
  };
}

// What each provider reports for a tool that opens something.
const readFile = (path: string, range: { offset?: number; limit?: number } = {}) => ({
  type: "dynamic_tool",
  toolName: "Read",
  input: { file_path: path, ...range },
});
const cadTool = (tool: "cad_open" | "cad_show", path: string) => ({
  type: "dynamic_tool",
  toolName: `mcp__t3-code__text-to-cad__${tool}`,
  input: { path },
});
const shell = (command: string) => ({ type: "command_execution", input: command });
const webFetch = (url: string) => ({
  type: "web_search",
  patterns: [url],
  results: [{ url, snippet: "The page's text" }],
});
const webSearch = (
  patterns: ReadonlyArray<string>,
  results: ReadonlyArray<{ title?: string; url?: string }> = [],
) => ({ type: "web_search", patterns, results });
const fileSearch = (results: ReadonlyArray<{ fileName: string; line?: number }>) => ({
  type: "file_search",
  pattern: "bracket",
  results,
});

const file = (
  path: string,
  lines: [number, number] | null = null,
  heading: string | null = null,
) => ({ kind: "file" as const, path, lines, heading });
const page = (url: string) => ({ kind: "url" as const, url });

describe("turnReferences", () => {
  it("lists what the agent cited, each with when it was opened", () => {
    const chat = makeChat();
    const entries = [
      chat.user(run1),
      chat.tool(run1, readFile("/work/rover-cad/docs/prd.md")),
      chat.assistant(run1, "It is in the brief."),
      chat.user(run2),
      chat.tool(run2, readFile("/work/rover-cad/parts/bracket.py", { offset: 12, limit: 7 })),
    ];
    const answer = [
      "The holes are 3.4 mm [1], sized for the M3 screws the brief names [2].",
      "",
      "Sources:",
      "[1] parts/bracket.py:12-18",
      "[2] docs/prd.md#Fits",
    ].join("\n");
    expect(turnReferences({ answer, runId: run2, entries })).toEqual([
      { n: 1, target: file("parts/bracket.py", [12, 18]), opened: "this turn" },
      { n: 2, target: file("docs/prd.md", null, "Fits"), opened: "earlier in this chat" },
    ]);
  });

  it("marks a citation nothing opened", () => {
    const chat = makeChat();
    const entries = [
      chat.user(run1),
      chat.tool(run1, readFile("/work/rover-cad/parts/bracket.py")),
      // Ends in the cited name, but not at a folder boundary.
      chat.tool(run1, readFile("/work/rover-cad/old-docs/prd.md")),
      chat.tool(run1, webFetch("https://example.com/spec")),
    ];
    const answer = [
      "Sources:",
      "[1] parts/other.py:3",
      "[2] docs/prd.md",
      "[3] https://example.com/other",
      "[4] parts/bracket.py:1-2",
    ].join("\n");
    expect(turnReferences({ answer, runId: run1, entries })).toEqual([
      { n: 1, target: file("parts/other.py", [3, 3]), opened: "not opened" },
      { n: 2, target: file("docs/prd.md"), opened: "not opened" },
      { n: 3, target: page("https://example.com/other"), opened: "not opened" },
      // The lines it cites do not decide whether the file was opened.
      { n: 4, target: file("parts/bracket.py", [1, 2]), opened: "this turn" },
    ]);
  });

  it("labels own knowledge", () => {
    const answer = "Sources:\n[1] own knowledge: ISO 2768 general tolerances\n[2] OWN KNOWLEDGE";
    expect(turnReferences({ answer, runId: run1, entries: [] })).toEqual([
      {
        n: 1,
        target: { kind: "own", text: "ISO 2768 general tolerances" },
        opened: "own knowledge",
      },
      { n: 2, target: { kind: "own", text: "" }, opened: "own knowledge" },
    ]);
  });

  it("falls back to this turn's openings without a block", () => {
    const chat = makeChat();
    const entries = [
      chat.user(run1),
      chat.tool(run1, readFile("/work/rover-cad/docs/earlier.md")),
      chat.assistant(run1, "Done."),
      chat.user(run2),
      chat.tool(run2, readFile("/work/rover-cad/docs/prd.md")),
      // The agent's own skill and tool docs live in hidden folders.
      chat.tool(run2, readFile("/Users/amy/.claude/skills/cad/SKILL.md")),
      chat.tool(run2, cadTool("cad_show", "/work/rover-cad/parts/bracket.step")),
      chat.tool(run2, readFile("/work/rover-cad/docs/prd.md", { offset: 5, limit: 4 })),
      chat.tool(run2, webFetch("https://example.com/spec#section")),
      chat.tool(
        run2,
        webSearch(["torx screw drive"], [{ title: "Torx drive", url: "https://example.org/torx" }]),
      ),
      chat.tool(run3, readFile("/work/rover-cad/docs/later.md")),
    ];
    expect(turnReferences({ answer: "The bracket is 3 mm thick.", runId: run2, entries })).toEqual([
      { n: 1, target: file("/work/rover-cad/docs/prd.md"), opened: "this turn" },
      { n: 2, target: file("/work/rover-cad/parts/bracket.step"), opened: "this turn" },
      { n: 3, target: page("https://example.com/spec#section"), opened: "this turn" },
      {
        n: 4,
        target: page("https://example.org/torx"),
        opened: "this turn",
        title: "Torx drive",
      },
    ]);
  });

  it("lists nothing for an answer that cites nothing and whose turn opened nothing", () => {
    const chat = makeChat();
    const entries = [
      chat.user(run1),
      chat.tool(run1, shell("python parts/bracket.py")),
      chat.assistant(run1, "Built."),
    ];
    expect(turnReferences({ answer: "Built.", runId: run1, entries })).toEqual([]);
  });

  it("does not drop a cited source for being outside the project", () => {
    const chat = makeChat();
    const entries = [
      chat.user(run1),
      chat.tool(run1, readFile("/Users/amy/.claude/skills/cad/SKILL.md")),
    ];
    const answer = "Sources:\n[1] /Users/amy/.claude/skills/cad/SKILL.md";
    expect(turnReferences({ answer, runId: run1, entries })).toEqual([
      {
        n: 1,
        target: file("/Users/amy/.claude/skills/cad/SKILL.md"),
        opened: "this turn",
      },
    ]);
  });

  it("matches a page by its address without the fragment", () => {
    const chat = makeChat();
    const entries = [
      chat.user(run1),
      chat.tool(run1, webFetch("https://Example.com/spec#intro")),
      chat.tool(run1, webFetch("https://example.com/other/")),
    ];
    const answer = [
      "Sources:",
      "[1] https://example.com/spec#clearance",
      "[2] https://example.com/spec?page=2",
      "[3] https://example.com/other",
      "[4] https://example.com/other/",
    ].join("\n");
    expect(turnReferences({ answer, runId: run1, entries })).toEqual([
      { n: 1, target: page("https://example.com/spec#clearance"), opened: "this turn" },
      // A different query is a different page.
      { n: 2, target: page("https://example.com/spec?page=2"), opened: "not opened" },
      { n: 3, target: page("https://example.com/other"), opened: "not opened" },
      { n: 4, target: page("https://example.com/other/"), opened: "this turn" },
    ]);
  });

  it("compares an address that does not parse as written, without the fragment", () => {
    const chat = makeChat();
    const entries = [chat.user(run1), chat.tool(run1, webFetch("http://[bad/page#one"))];
    const answer = "Sources:\n[1] http://[bad/page#two\n[2] http://[bad/other#one";
    expect(turnReferences({ answer, runId: run1, entries }).map((item) => item.opened)).toEqual([
      "this turn",
      "not opened",
    ]);
  });

  it("leaves out an answer's later runs", () => {
    const chat = makeChat();
    const entries = [
      chat.user(run1),
      chat.assistant(run1, "First."),
      chat.user(run2),
      chat.assistant(run2, "Second."),
      chat.user(run3),
      chat.tool(run3, readFile("/work/rover-cad/docs/prd.md")),
      chat.tool(run3, webFetch("https://example.com/spec")),
    ];
    const answer = "Sources:\n[1] docs/prd.md\n[2] https://example.com/spec";
    expect(turnReferences({ answer, runId: run2, entries })).toEqual([
      { n: 1, target: file("docs/prd.md"), opened: "not opened" },
      { n: 2, target: page("https://example.com/spec"), opened: "not opened" },
    ]);
    // The later run's own answer sees them as this turn's.
    expect(turnReferences({ answer, runId: run3, entries }).map((item) => item.opened)).toEqual([
      "this turn",
      "this turn",
    ]);
    // And the earlier run's openings are earlier for it.
    expect(turnReferences({ answer: "Sources:\n[1] docs/prd.md", runId: run1, entries })).toEqual([
      { n: 1, target: file("docs/prd.md"), opened: "not opened" },
    ]);
  });

  it("matches a cited relative path to an absolute Read", () => {
    const chat = makeChat();
    const entries = [
      chat.user(run1),
      chat.tool(run1, readFile("/work/rover-cad/parts/bracket.py")),
      chat.tool(run1, readFile("C:\\work\\rover-cad\\docs\\prd.md")),
      chat.tool(run1, shell("cat docs/notes.md")),
    ];
    const answer = [
      "Sources:",
      "[1] parts/bracket.py:12-18",
      "[2] ./parts/bracket.py",
      "[3] docs/prd.md#Fits",
      "[4] /work/rover-cad/docs/notes.md",
      "[5] bracket.py",
    ].join("\n");
    expect(turnReferences({ answer, runId: run1, entries }).map((item) => item.opened)).toEqual([
      "this turn",
      "this turn",
      "this turn",
      // A Read that is relative, cited by its absolute path.
      "this turn",
      "this turn",
    ]);
  });

  it("shows a cited page by the title a search gave it", () => {
    const chat = makeChat();
    const entries = [
      chat.user(run1),
      chat.tool(
        run1,
        webSearch(["torx"], [{ title: "Torx drive", url: "https://example.org/torx" }]),
      ),
      chat.tool(run1, webFetch("https://example.org/torx")),
    ];
    const answer = "Sources:\n[1] https://example.org/torx\n[2] https://example.org/other";
    expect(turnReferences({ answer, runId: run1, entries })).toEqual([
      {
        n: 1,
        target: page("https://example.org/torx"),
        opened: "this turn",
        title: "Torx drive",
      },
      { n: 2, target: page("https://example.org/other"), opened: "not opened" },
    ]);
  });

  it("prefers this turn to an earlier opening", () => {
    const chat = makeChat();
    const entries = [
      chat.user(run1),
      chat.tool(run1, readFile("/work/rover-cad/docs/prd.md")),
      chat.user(run2),
      chat.tool(run2, readFile("/work/rover-cad/docs/prd.md")),
    ];
    expect(
      turnReferences({ answer: "Sources:\n[1] docs/prd.md", runId: run2, entries })[0]?.opened,
    ).toBe("this turn");
  });

  it("gives an answer with no run no this turn, and the whole chat as earlier", () => {
    const chat = makeChat();
    const entries = [
      chat.user(null),
      chat.tool(null, readFile("/work/rover-cad/docs/prd.md")),
      chat.assistant(null, "Done."),
    ];
    expect(
      turnReferences({ answer: "Sources:\n[1] docs/prd.md\n[2] parts/a.py", runId: null, entries }),
    ).toEqual([
      { n: 1, target: file("docs/prd.md"), opened: "earlier in this chat" },
      { n: 2, target: file("parts/a.py"), opened: "not opened" },
    ]);
    expect(turnReferences({ answer: "Done.", runId: null, entries })).toEqual([]);
  });

  it("counts a run the chat does not hold yet as after everything it has", () => {
    const chat = makeChat();
    const entries = [chat.user(run1), chat.tool(run1, readFile("/work/rover-cad/docs/prd.md"))];
    expect(
      turnReferences({ answer: "Sources:\n[1] docs/prd.md", runId: run2, entries })[0]?.opened,
    ).toBe("earlier in this chat");
  });
});

describe("openedInChat", () => {
  it("reads Claude's Read, and the lines its offset and limit give", () => {
    const chat = makeChat();
    const entries = [
      chat.tool(run1, readFile("/work/rover-cad/parts/a.py", { offset: 12, limit: 7 })),
      chat.tool(run1, readFile("/work/rover-cad/parts/b.py", { offset: 12 })),
      chat.tool(run1, readFile("/work/rover-cad/parts/c.py", { limit: 7 })),
      chat.tool(run1, readFile("/work/rover-cad/parts/d.py")),
      chat.tool(run1, readFile("/work/rover-cad/parts/e.py", { offset: 0, limit: 7 })),
    ];
    expect(openedInChat(entries)).toEqual([
      {
        target: file("/work/rover-cad/parts/a.py", [12, 18]),
        runId: run1,
        at: entries[0]!.createdAt,
      },
      { target: file("/work/rover-cad/parts/b.py"), runId: run1, at: entries[1]!.createdAt },
      { target: file("/work/rover-cad/parts/c.py"), runId: run1, at: entries[2]!.createdAt },
      { target: file("/work/rover-cad/parts/d.py"), runId: run1, at: entries[3]!.createdAt },
      { target: file("/work/rover-cad/parts/e.py"), runId: run1, at: entries[4]!.createdAt },
    ]);
  });

  it("reads the Read other providers report, by whichever key holds the path", () => {
    const chat = makeChat();
    const entries = [
      // The adapters for Cursor, Grok and other ACP agents call their reads `Read`.
      chat.tool(run1, {
        type: "dynamic_tool",
        toolName: "Read",
        input: { path: "/work/rover-cad/docs/a.md", offset: 2, limit: 3 },
      }),
      // OpenCode's `read`.
      chat.tool(run1, {
        type: "dynamic_tool",
        toolName: "read",
        input: { filePath: "/work/rover-cad/docs/b.md" },
      }),
      chat.tool(run1, { type: "dynamic_tool", toolName: "Read", input: { limit: 3 } }),
      chat.tool(run1, { type: "dynamic_tool", toolName: "Reader", input: { path: "docs/c.md" } }),
    ];
    expect(openedInChat(entries).map((opened) => opened.target)).toEqual([
      file("/work/rover-cad/docs/a.md"),
      file("/work/rover-cad/docs/b.md"),
    ]);
  });

  it("reads the CAD tools that show or open a model", () => {
    const chat = makeChat();
    const entries = [
      chat.tool(run1, cadTool("cad_open", "/work/rover-cad/parts/bracket.step")),
      chat.tool(run1, cadTool("cad_show", "/work/rover-cad/parts/servo.step")),
      chat.tool(run1, {
        type: "dynamic_tool",
        toolName: "text-to-cad.cad_show",
        input: { path: "/work/rover-cad/parts/arm.step" },
      }),
      // The other viewer tools show what is already open.
      chat.tool(run1, {
        type: "dynamic_tool",
        toolName: "mcp__t3-code__text-to-cad__cad_screenshot",
        input: { path: "/work/rover-cad/parts/other.step" },
      }),
      chat.tool(run1, {
        type: "dynamic_tool",
        toolName: "Glob",
        input: { path: "/work/rover-cad" },
      }),
    ];
    expect(openedInChat(entries).map((opened) => opened.target)).toEqual([
      file("/work/rover-cad/parts/bracket.step"),
      file("/work/rover-cad/parts/servo.step"),
      file("/work/rover-cad/parts/arm.step"),
    ]);
  });

  it("reads each result of a file search, and its line", () => {
    const chat = makeChat();
    const entries = [
      chat.tool(
        run1,
        fileSearch([{ fileName: "docs/prd.md", line: 4 }, { fileName: "parts/a.py" }]),
      ),
    ];
    expect(openedInChat(entries).map((opened) => opened.target)).toEqual([
      file("docs/prd.md", [4, 4]),
      file("parts/a.py"),
    ]);
  });

  it("reads the pages of a web search, and a pattern only when it is an address", () => {
    const chat = makeChat();
    const entries = [
      chat.tool(
        run1,
        webSearch(
          ["torx screw drive"],
          [{ title: "Torx drive", url: "https://example.org/torx" }, { title: "No address" }],
        ),
      ),
      // Codex's web_search carries search words, or a page it opened.
      chat.tool(run1, webSearch(["torx", "https://example.org/codex#top"])),
      chat.tool(run1, webFetch("https://example.org/fetched")),
    ];
    expect(openedInChat(entries)).toEqual([
      {
        target: page("https://example.org/torx"),
        runId: run1,
        at: entries[0]!.createdAt,
        title: "Torx drive",
      },
      { target: page("https://example.org/codex#top"), runId: run1, at: entries[1]!.createdAt },
      { target: page("https://example.org/fetched"), runId: run1, at: entries[2]!.createdAt },
    ]);
  });

  it("reads a Codex sed read", () => {
    const chat = makeChat();
    const entries = [
      chat.tool(run1, shell("sed -n '12,18p' parts/bracket.py")),
      chat.tool(run1, shell(`/bin/zsh -lc "sed -n '12,18p' parts/bracket.py"`)),
    ];
    expect(openedInChat(entries)).toEqual([
      { target: file("parts/bracket.py", [12, 18]), runId: run1, at: entries[0]!.createdAt },
      { target: file("parts/bracket.py", [12, 18]), runId: run1, at: entries[1]!.createdAt },
    ]);
  });

  it.each<[command: string, path: string, lines: [number, number] | null]>([
    ["cat docs/prd.md", "docs/prd.md", null],
    ["cat -n docs/prd.md", "docs/prd.md", null],
    ["nl -ba docs/prd.md", "docs/prd.md", null],
    ["tail docs/prd.md", "docs/prd.md", null],
    ["tail -n 20 docs/prd.md", "docs/prd.md", null],
    ["head docs/prd.md", "docs/prd.md", null],
    ["head -n 40 parts/bracket.py", "parts/bracket.py", [1, 40]],
    ["head -n40 parts/bracket.py", "parts/bracket.py", [1, 40]],
    ["head -40 parts/bracket.py", "parts/bracket.py", [1, 40]],
    ["head -c 100 parts/bracket.py", "parts/bracket.py", null],
    ["sed -n '12,18p' parts/bracket.py", "parts/bracket.py", [12, 18]],
    [`sed -n "12,18p" parts/bracket.py`, "parts/bracket.py", [12, 18]],
    ["sed -n 12,18p parts/bracket.py", "parts/bracket.py", [12, 18]],
    ["sed -n '12p' parts/bracket.py", "parts/bracket.py", [12, 12]],
    [`cat "docs/Design notes.md"`, "docs/Design notes.md", null],
    ["cat 'docs/it'\\''s.md'", "docs/it's.md", null],
    [`/bin/zsh -lc "sed -n '12,18p' parts/bracket.py"`, "parts/bracket.py", [12, 18]],
    [`zsh -c 'cat docs/prd.md'`, "docs/prd.md", null],
    [`/bin/bash -lc "head -n 5 docs/prd.md"`, "docs/prd.md", [1, 5]],
    [`sh -c "cat docs/prd.md"`, "docs/prd.md", null],
    [`/usr/bin/bash -lc 'cat "docs/Design notes.md"'`, "docs/Design notes.md", null],
  ])("reads the Codex command %j as a read of %j, lines %j", (command, path, lines) => {
    const chat = makeChat();
    const entry = chat.tool(run1, shell(command));
    expect(openedInChat([entry])).toEqual([
      { target: file(path, lines), runId: run1, at: entry.createdAt },
    ]);
  });

  it.each([
    "cat docs/prd.md | head -n 5",
    "cat docs/prd.md|head",
    "cat docs/prd.md>out.txt",
    "cat docs/prd.md&&ls",
    "sed -n '12,18p' parts/bracket.py|cat",
    "cat docs/a.md docs/b.md",
    "cat docs/a.md > docs/b.md",
    "cat < docs/a.md",
    "cd parts && cat a.md",
    "cat a.md || cat b.md",
    "cat a.md; rm b.md",
    "cat a.md &",
    "cat *.md",
    "cat docs/?.md",
    "cat $HOME/a.md",
    "cat `which a.md`",
    "cat $(pwd)/a.md",
    "cat -",
    "cat",
    "head -n 5",
    "sed -n '12,18p;20p' a.md",
    "sed -n '18,12p' a.md",
    "sed -n '0,5p' a.md",
    "sed -n '12,18p' a.md b.md",
    "sed -i 's/a/b/' a.md",
    "sed 's/a/b/' a.md",
    "sed -n -e '12p' a.md",
    "nl -ba docs/prd.md | sed -n '10,20p'",
    "rg bracket parts",
    "ls parts",
    "python parts/bracket.py",
    `bash -lc "bash -lc 'cat a.md'"`,
    `bash -c 'cat a.md' extra`,
    `bash -lc "cat a.md; ls"`,
    `bash -lc 'cat "unterminated.md'`,
    "cat a.md\ncat b.md",
    "",
  ])("does not read the command %j as a read", (command) => {
    const chat = makeChat();
    expect(openedInChat([chat.tool(run1, shell(command))])).toEqual([]);
  });

  it.each(["failed", "cancelled", "interrupted"])("leaves out a call that %s", (status) => {
    const chat = makeChat();
    const entries = [
      chat.tool(run1, { ...readFile("/work/rover-cad/docs/prd.md"), status }),
      chat.tool(run1, { ...cadTool("cad_show", "/work/rover-cad/parts/a.step"), status }),
      chat.tool(run1, { ...shell("cat docs/notes.md"), status }),
      chat.tool(run1, { ...webFetch("https://example.org/page"), status }),
      chat.tool(run1, { ...fileSearch([{ fileName: "parts/a.py" }]), status }),
    ];
    expect(openedInChat(entries)).toEqual([]);
  });

  it("reads only what the agent's tools report, in the order of the chat", () => {
    const chat = makeChat();
    const entries = [
      chat.user(run1, "Read docs/nothing.md"),
      chat.tool(run1, { type: "reasoning", text: "cat docs/thought.md" }),
      chat.tool(run1, { type: "file_change", fileName: "docs/changed.md" }),
      chat.tool(run1, { type: "dynamic_tool", toolName: "Read", input: "docs/odd.md" }),
      chat.tool(run1, { type: "dynamic_tool", toolName: "Read", input: { file_path: "  " } }),
      chat.tool(run1, { type: "dynamic_tool", toolName: null, input: { path: "docs/none.md" } }),
      chat.tool(run1, readFile("docs/first.md")),
      chat.assistant(run1, "I read docs/second.md"),
      chat.tool(run1, readFile("docs/second.md")),
    ];
    expect(openedInChat(entries).map((opened) => opened.target)).toEqual([
      file("docs/first.md"),
      file("docs/second.md"),
    ]);
  });

  it("reads the chat once, however many answers ask", () => {
    const chat = makeChat();
    const entries = [chat.user(run1), chat.tool(run1, readFile("/work/rover-cad/docs/prd.md"))];
    expect(openedInChat(entries)).toBe(openedInChat(entries));
    expect(openedInChat([...entries])).not.toBe(openedInChat(entries));
    expect(openedInChat([...entries])).toEqual(openedInChat(entries));
  });
});

describe("referenceLabel", () => {
  const reference = (target: AnswerReference["target"], title?: string): AnswerReference => ({
    n: 1,
    target,
    opened: "this turn",
    ...(title === undefined ? {} : { title }),
  });

  it("names a file as Studio names it, and says where in it", () => {
    expect(referenceLabel(reference(file("parts/servo_bracket.step", [12, 18])))).toEqual({
      name: "Servo bracket",
      where: "lines 12–18",
    });
    expect(referenceLabel(reference(file("./parts/servo_bracket.step", [12, 12])))).toEqual({
      name: "Servo bracket",
      where: "line 12",
    });
    expect(referenceLabel(reference(file("docs/prd.md", null, "Scope: what we make")))).toEqual({
      name: "PRD",
      where: "Scope: what we make",
    });
  });

  it("names a file Studio files as nothing by its file name", () => {
    expect(referenceLabel(reference(file("parts/bracket.py", [3, 9])))).toEqual({
      name: "bracket.py",
      where: "lines 3–9",
    });
    expect(referenceLabel(reference(file("C:\\work\\rover\\notes.cfg")))).toEqual({
      name: "notes.cfg",
      where: null,
    });
  });

  it("names a page by its title, else by its host", () => {
    expect(referenceLabel(reference(page("https://example.org/torx#a"), "Torx drive"))).toEqual({
      name: "Torx drive",
      where: "example.org",
    });
    expect(referenceLabel(reference(page("https://Example.org:8080/torx")))).toEqual({
      name: "example.org",
      where: null,
    });
    expect(referenceLabel(reference(page("http://[bad/page")))).toEqual({
      name: "http://[bad/page",
      where: null,
    });
  });

  it("names own knowledge by its words", () => {
    expect(referenceLabel(reference({ kind: "own", text: "ISO 2768" }))).toEqual({
      name: "ISO 2768",
      where: null,
    });
    expect(referenceLabel(reference({ kind: "own", text: "" }))).toEqual({
      name: "Own knowledge",
      where: null,
    });
  });
});

describe("referencesEqual", () => {
  const base: AnswerReference[] = [
    { n: 1, target: file("parts/bracket.py", [12, 18]), opened: "this turn" },
    { n: 2, target: file("docs/prd.md", null, "Fits"), opened: "earlier in this chat" },
    { n: 3, target: page("https://example.org/torx"), opened: "this turn", title: "Torx drive" },
    { n: 4, target: { kind: "own", text: "ISO 2768" }, opened: "own knowledge" },
  ];
  const copy = (): AnswerReference[] => structuredClone(base);

  it("is true for the same list read twice", () => {
    expect(referencesEqual(base, copy())).toBe(true);
    expect(referencesEqual(base, base)).toBe(true);
    expect(referencesEqual(undefined, undefined)).toBe(true);
    expect(referencesEqual([], [])).toBe(true);
  });

  it("is false when a list, or any field of an item, differs", () => {
    expect(referencesEqual(base, undefined)).toBe(false);
    expect(referencesEqual(undefined, base)).toBe(false);
    expect(referencesEqual(base, base.slice(0, 3))).toBe(false);
    const edits: Array<(list: AnswerReference[]) => void> = [
      (list) => (list[0] = { ...list[0]!, n: 9 }),
      (list) => (list[0] = { ...list[0]!, opened: "not opened" }),
      (list) => (list[0] = { ...list[0]!, target: file("parts/bracket.py", [12, 19]) }),
      (list) => (list[0] = { ...list[0]!, target: file("parts/bracket.py") }),
      (list) => (list[0] = { ...list[0]!, target: file("parts/other.py", [12, 18]) }),
      (list) => (list[1] = { ...list[1]!, target: file("docs/prd.md", null, "Scope") }),
      (list) => (list[1] = { ...list[1]!, target: file("docs/prd.md") }),
      (list) => (list[2] = { ...list[2]!, target: page("https://example.org/other") }),
      (list) => (list[2] = { n: 3, target: page("https://example.org/torx"), opened: "this turn" }),
      (list) => (list[2] = { ...list[2]!, title: "Another title" }),
      (list) => (list[3] = { ...list[3]!, target: { kind: "own", text: "ISO 273" } }),
      (list) => (list[3] = { ...list[3]!, target: page("https://example.org/torx") }),
    ];
    for (const edit of edits) {
      const changed = copy();
      edit(changed);
      expect(referencesEqual(base, changed)).toBe(false);
    }
  });
});

describe("the answer's row", () => {
  const derive = (timelineEntries: ReadonlyArray<TimelineEntry>, isWorking = false) =>
    deriveMessagesTimelineRows({
      timelineEntries,
      isWorking,
      ...(isWorking ? { runningRunId: run1 } : {}),
      turnDiffSummaries: [],
      supportsConversationRollback: false,
    });
  const messageRows = (rows: ReturnType<typeof derive>) =>
    rows.flatMap((row) => (row.kind === "message" ? [row] : []));

  const sources = "It is 3 mm [1].\n\nSources:\n[1] docs/prd.md#Fits";
  const opening = (chat: ReturnType<typeof makeChat>, path = "/work/rover-cad/docs/prd.md") =>
    chat.tool(run1, readFile(path));

  it("carries the references of the run's final answer, from every entry of the chat", () => {
    const chat = makeChat();
    const entries = [
      chat.user(run1),
      opening(chat),
      chat.assistant(run1, "Let me look at the brief."),
      chat.tool(run1, shell("ls docs")),
      chat.assistant(run1, sources),
      chat.user(run2),
      chat.assistant(run2, "Nothing to add."),
    ];
    const rows = derive(entries);
    // The turn is folded: the read is not a row, but the list still has it.
    expect(rows.some((row) => row.kind === "turn-fold")).toBe(true);
    expect(rows.some((row) => row.kind === "work")).toBe(false);
    const withReferences = messageRows(rows).filter((row) => row.references !== undefined);
    expect(withReferences.map((row) => row.message.text)).toEqual([sources]);
    expect(withReferences[0]?.references).toEqual([
      { n: 1, target: file("docs/prd.md", null, "Fits"), opened: "this turn" },
    ]);
  });

  it("carries none for an answer with nothing to list", () => {
    const chat = makeChat();
    const rows = derive([chat.user(run1), chat.assistant(run1, "Hello.")]);
    expect(messageRows(rows).map((row) => row.references)).toEqual([undefined, undefined]);
  });

  it("waits until the run's answer is final", () => {
    const chat = makeChat();
    const entries = [chat.user(run1), opening(chat), chat.assistant(run1, sources)];
    expect(messageRows(derive(entries, true)).map((row) => row.references)).toEqual([
      undefined,
      undefined,
    ]);
    expect(messageRows(derive(entries)).at(-1)?.references).toHaveLength(1);
  });

  it("leaves a message that is still streaming alone", () => {
    const chat = makeChat();
    const entries = [chat.user(run1), opening(chat), chat.assistant(run1, sources, true)];
    expect(messageRows(derive(entries)).map((row) => row.references)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("is reused across derive passes when nothing changed", () => {
    const chat = makeChat();
    const entries = [chat.user(run1), opening(chat), chat.assistant(run1, sources)];
    const firstRows = derive(entries);
    const first = computeStableMessagesTimelineRows(firstRows, { byId: new Map(), result: [] });
    // The chat arrives as a new array of the same entries: the list is read again, as new objects.
    const secondRows = derive([...entries]);
    const second = computeStableMessagesTimelineRows(secondRows, first);
    const before = messageRows(firstRows).at(-1);
    const fresh = messageRows(secondRows).at(-1);
    expect(fresh?.references).not.toBe(before?.references);
    expect(fresh?.references).toEqual(before?.references);
    // The row it sits in is the one it had, so it does not render again.
    expect(messageRows(second.result).at(-1)).toBe(before);
    expect(second).toBe(first);
  });

  it("is replaced when the references change", () => {
    const chat = makeChat();
    const user = chat.user(run1);
    const stale = opening(chat, "/work/rover-cad/docs/other.md");
    const read = opening(chat);
    const answer = chat.assistant(run1, sources);
    const first = computeStableMessagesTimelineRows(derive([user, stale, answer]), {
      byId: new Map(),
      result: [],
    });
    const second = computeStableMessagesTimelineRows(derive([user, read, answer]), first);
    const before = messageRows(first.result).at(-1);
    const after = messageRows(second.result).at(-1);
    // Nothing else about the answer changed: only what it cites was opened.
    expect(after?.message).toBe(before?.message);
    expect(before?.references?.map((item) => item.opened)).toEqual(["not opened"]);
    expect(after?.references?.map((item) => item.opened)).toEqual(["this turn"]);
    expect(after).not.toBe(before);
  });
});
