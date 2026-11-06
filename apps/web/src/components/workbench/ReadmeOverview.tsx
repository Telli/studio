import type { EnvironmentId } from "@t3tools/contracts";
import {
  createContext,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { observeVisibleAnimation } from "~/lib/visibleAnimation";
import {
  getOptimisticProjectFileQueryData,
  setProjectFileQueryData,
  useProjectFileQuery,
} from "../files/projectFilesQueryState";
import { useFileSaveCoordinator } from "../files/useFileSaveCoordinator";
import { OverviewModule, useFoldedModules } from "./OverviewModules";
import {
  isPlainReadmeText,
  type ReadmeBlock,
  type ReadmeDecision,
  readmeInline,
  readmeRuns,
  readmeSections,
  replaceReadmeText,
  scribblePath,
  useReadmeWriteIn,
  writtenWordDelays,
} from "./projectReadme";

const SECTION_LABEL = "text-2xs font-medium tracking-widest text-muted-foreground uppercase";
/** A point of the README, by its depth: each level further in, with its own marker. */
const POINT = ["ms-4 list-disc", "ms-8 list-[circle]", "ms-12 list-[square]"] as const;
const LINK =
  "rounded-sm text-foreground underline decoration-muted-foreground/50 underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

/** Whether the README on screen is the first one, its words coming in one after another. */
const WritingIn = createContext(false);

/** Words as they read; in a first README, each its own piece for `.readme-word` to bring in. */
function Words(props: { readonly text: string }) {
  if (!useContext(WritingIn)) return props.text;
  return props.text.split(/(\s+)/).map((word, index) =>
    index % 2 === 1 || word === "" ? (
      word
    ) : (
      <span key={`${index}-${word}`} data-readme-word="" className="readme-word">
        {word}
      </span>
    ),
  );
}

/** README text as it reads: a link opens the file or page it names, and markdown marks drop away. */
function ReadmeText(props: { readonly text: string; readonly onOpenPath: (path: string) => void }) {
  return readmeInline(props.text).map((piece, index) => {
    const key = `${index}-${piece.kind}`;
    const words = <Words text={piece.text} />;
    if (piece.kind === "strong") {
      return (
        <strong key={key} className="font-medium">
          {words}
        </strong>
      );
    }
    if (piece.kind === "text") return <span key={key}>{words}</span>;
    return /^https?:\/\//i.test(piece.target) ? (
      <a key={key} href={piece.target} target="_blank" rel="noreferrer" className={LINK}>
        {words}
      </a>
    ) : (
      <button
        key={key}
        type="button"
        onClick={() => props.onOpenPath(piece.target)}
        className={LINK}
      >
        {words}
      </button>
    );
  });
}

const SCRIBBLES = [scribblePath(312, 1), scribblePath(276, 2), scribblePath(168, 3)];

/** A new project's Overview while its first chat writes it: lines of writing going down the page. */
function WritingOverview() {
  return (
    <div ref={observeVisibleAnimation} role="status" className="flex flex-col gap-2">
      <svg
        aria-hidden="true"
        viewBox="0 0 320 54"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="readme-writing w-full max-w-80 text-muted-foreground"
      >
        {SCRIBBLES.map((path, line) => (
          <path key={path} d={path} pathLength={1} transform={`translate(0 ${line * 18})`} />
        ))}
      </svg>
      <p className="text-sm text-muted-foreground">
        <span className="live-tool-shine">Writing the overview</span>
      </p>
    </div>
  );
}

const README = "README.md";
const noPending = () => {};

/**
 * A piece of the README typed into where it reads, as a document's pieces are
 * (`StudioDocumentSurface`): a click puts the cursor there, leaving it saves the new words in that
 * place (`replaceReadmeText`), Escape puts the old ones back, and Enter leaves a one-line piece.
 * Words with a link or bold in them stay as they are.
 */
function Typed(props: {
  /** The words as the file has them; null for words not from it (the brief's purpose). */
  readonly words: string | null;
  readonly multiline?: boolean;
  readonly onSave: (before: string, after: string) => void;
  readonly children: ReactNode;
}) {
  const { words } = props;
  if (words === null || !isPlainReadmeText(words)) return props.children;
  const begin = (event: MouseEvent<HTMLSpanElement>) => {
    const piece = event.currentTarget;
    if (piece.isContentEditable) return;
    piece.dataset.before = piece.innerText;
    piece.setAttribute("contenteditable", "plaintext-only");
    piece.focus();
    // The cursor goes where the click was, as in any editor.
    const at = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (at) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(at);
    }
  };
  const keys = (event: KeyboardEvent<HTMLSpanElement>) => {
    const piece = event.currentTarget;
    if (event.key === "Escape") {
      event.preventDefault();
      piece.innerText = piece.dataset.before ?? piece.innerText;
      piece.blur();
    } else if (event.key === "Enter" && !(props.multiline && event.shiftKey)) {
      event.preventDefault();
      piece.blur();
    }
  };
  return (
    <span
      data-src-plain=""
      onClick={begin}
      onKeyDown={keys}
      onBlur={(event) => {
        const piece = event.currentTarget;
        piece.removeAttribute("contenteditable");
        const typed = piece.innerText;
        if (typed.trim() !== (piece.dataset.before ?? "").trim()) props.onSave(words, typed);
      }}
    >
      {props.children}
    </span>
  );
}

/** "Oct 19, asked": when and how a decision was made, as far as its line says. */
function decisionNote(decision: ReadmeDecision): string | null {
  const day =
    decision.when === null
      ? null
      : new Date(`${decision.when}T00:00:00`).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
  const note = [day, decision.how].filter((part) => part !== null).join(", ");
  return note === "" ? null : note;
}

/** A section's prose, `###` headings and nested points, in the order written. */
function ReadmeBlocks(props: {
  readonly blocks: ReadonlyArray<ReadmeBlock>;
  readonly onSave: (before: string, after: string) => void;
  readonly onOpenPath: (path: string) => void;
}) {
  const words = (text: string) => (
    <Typed words={text} multiline onSave={props.onSave}>
      <ReadmeText text={text} onOpenPath={props.onOpenPath} />
    </Typed>
  );
  return readmeRuns(props.blocks).map((run) => {
    if ("kind" in run) {
      return run.kind === "subheading" ? (
        <h3 key={run.text} className="pt-1 text-xs font-medium text-foreground">
          {words(run.text)}
        </h3>
      ) : (
        <p key={run.text} className="max-w-[75ch] text-sm leading-relaxed text-foreground">
          {words(run.text)}
        </p>
      );
    }
    return (
      <ul key={run[0]?.text} className="flex max-w-[75ch] flex-col gap-1 text-sm text-foreground">
        {run.map((point) => (
          <li key={point.text} className={POINT[Math.min(point.depth, POINT.length - 1)]}>
            {words(point.text)}
          </li>
        ))}
      </ul>
    );
  });
}

/**
 * The top of a project's Overview in the engineering interface: its README, read as an engineer
 * reads one. What it is (the brief's purpose until the README says), the decisions made so far,
 * each with when and whether it was asked of the agent or made by hand, then every other section
 * the README has (open questions, notes), each folded to its heading until opened, so the page is
 * as short as the project's picture and the parts stay in view. The agent keeps the README as it works
 * (`studioProjectContext`); the person types into it where it reads (`Typed`), with no Edit button.
 */
export function ReadmeOverview(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly purpose: string;
  /** A new project's first chat is at work on its first turn, which writes the README first. */
  readonly writing: boolean;
  /** Changes when the thread's agent changes files, the README among them. */
  readonly mutationId: string | null;
  /** Opens a file of the project, by its path in the README's folder: the README itself, or a link. */
  readonly onOpenPath: (path: string) => void;
}) {
  const { environmentId, cwd } = props;
  // Read with the person's unsaved typing in it, as the file view reads a file.
  const readme = useProjectFileQuery(environmentId, cwd, README);
  const saveCoordinator = useFileSaveCoordinator({
    environmentId,
    cwd,
    relativePath: README,
    onPendingChange: noPending,
  });
  // A change that could not be placed puts the piece's old words back (a new key, a fresh piece).
  const [refused, setRefused] = useState(0);
  const save = (before: string, after: string) => {
    const contents =
      getOptimisticProjectFileQueryData(environmentId, cwd, README)?.contents ??
      readme.data?.contents;
    const next = contents === undefined ? null : replaceReadmeText(contents, before, after);
    if (next === null || next === contents) {
      setRefused((count) => count + 1);
      return;
    }
    setProjectFileQueryData(environmentId, cwd, README, next);
    saveCoordinator.change(next);
  };
  useWorkspaceMutationRefresh({
    mutationId: props.mutationId,
    refresh: readme.refresh,
    resourceKey: `studio-readme:${props.cwd}`,
  });
  // The sections opened on this computer, kept as the Overview's modules keep their folds.
  const { folded: opened, toggle: toggleSection } = useFoldedModules(`readme:${props.cwd}`);
  const file = readme.data ?? null;
  const sections = readmeSections(file === null || file.truncated ? null : file.contents);
  const whatItIs = sections.whatItIs ?? (props.purpose.trim() || null);
  const { waiting, writingIn } = useReadmeWriteIn({
    writing: props.writing,
    written: sections.whatItIs === null ? null : (file?.contents ?? null),
  });
  const page = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (!writingIn) return;
    const words = page.current?.querySelectorAll<HTMLElement>("[data-readme-word]") ?? [];
    const delays = writtenWordDelays(words.length);
    words.forEach((word, index) => {
      word.style.animationDelay = `${delays(index)}ms`;
    });
  }, [writingIn]);

  if (waiting) {
    return (
      <section aria-label="README" className="flex flex-col gap-1.5">
        <h2 className={SECTION_LABEL}>What it is</h2>
        <WritingOverview />
      </section>
    );
  }

  return (
    <WritingIn.Provider value={writingIn}>
      <section
        ref={page}
        // Typed words are the file's once saved; a fresh piece shows them (or the old ones back).
        key={`${file?.contents ?? ""}:${refused}`}
        aria-label="README"
        data-document-editable=""
        className="flex flex-col gap-5"
      >
        <div className="flex flex-col gap-1.5">
          <h2 className={SECTION_LABEL}>What it is</h2>
          {whatItIs === null ? (
            <p className="text-sm text-muted-foreground">
              Not written yet. Studio writes it from the project's chats.
            </p>
          ) : (
            <p className="max-w-[75ch] text-sm leading-relaxed whitespace-pre-line text-foreground">
              <Typed words={sections.whatItIs} multiline onSave={save}>
                <ReadmeText text={whatItIs} onOpenPath={props.onOpenPath} />
              </Typed>
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className={SECTION_LABEL}>Decisions</h2>
          {sections.decisions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No decisions yet</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {sections.decisions.map((decision) => {
                const note = decisionNote(decision);
                return (
                  <li
                    key={`${decision.text}-${decision.when ?? ""}`}
                    className="flex flex-wrap items-baseline gap-x-2 text-sm text-foreground"
                  >
                    <span>
                      <Typed words={decision.text} onSave={save}>
                        <ReadmeText text={decision.text} onOpenPath={props.onOpenPath} />
                      </Typed>
                    </span>
                    {note === null ? null : (
                      <span className="text-xs text-muted-foreground">
                        <Words text={note} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {sections.more.length === 0 ? null : (
          <div className="flex flex-col gap-3">
            {sections.more.map((section) => (
              <OverviewModule
                key={section.heading}
                title={section.heading}
                count={section.blocks.filter((block) => block.kind !== "subheading").length}
                folded={!writingIn && !opened.includes(section.heading)}
                onFold={() => toggleSection(section.heading)}
              >
                <div className="flex flex-col gap-1.5 pt-2">
                  <ReadmeBlocks
                    blocks={section.blocks}
                    onSave={save}
                    onOpenPath={props.onOpenPath}
                  />
                </div>
              </OverviewModule>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Studio writes this from the project's chats and keeps it current. Click a line to change
          it.
        </p>
      </section>
    </WritingIn.Provider>
  );
}
