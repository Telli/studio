import type { EnvironmentId } from "@t3tools/contracts";
import { type KeyboardEvent, type MouseEvent, type ReactNode, useState } from "react";

import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import {
  getOptimisticProjectFileQueryData,
  setProjectFileQueryData,
  useProjectFileQuery,
} from "../files/projectFilesQueryState";
import { useFileSaveCoordinator } from "../files/useFileSaveCoordinator";
import {
  isPlainReadmeText,
  type ReadmeDecision,
  readmeInline,
  readmeSections,
  replaceReadmeText,
} from "./projectReadme";

const SECTION_LABEL = "text-2xs font-medium tracking-widest text-muted-foreground uppercase";
const LINK =
  "rounded-sm text-foreground underline decoration-muted-foreground/50 underline-offset-2 outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";

/** README text as it reads: a link opens the file or page it names, and markdown marks drop away. */
function ReadmeText(props: { readonly text: string; readonly onOpenPath: (path: string) => void }) {
  return readmeInline(props.text).map((piece, index) => {
    const key = `${index}-${piece.kind}`;
    if (piece.kind === "strong") {
      return (
        <strong key={key} className="font-medium">
          {piece.text}
        </strong>
      );
    }
    if (piece.kind === "text") return <span key={key}>{piece.text}</span>;
    return /^https?:\/\//i.test(piece.target) ? (
      <a key={key} href={piece.target} target="_blank" rel="noreferrer" className={LINK}>
        {piece.text}
      </a>
    ) : (
      <button
        key={key}
        type="button"
        onClick={() => props.onOpenPath(piece.target)}
        className={LINK}
      >
        {piece.text}
      </button>
    );
  });
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

/**
 * The top of a project's Overview in the engineering interface: its README, read as an engineer
 * reads one. What it is (the brief's purpose until the README says), the decisions made so far,
 * each with when and whether it was asked of the agent or made by hand, then every other section
 * the README has (open questions, notes). The agent keeps the README as it works
 * (`studioProjectContext`); the person types into it where it reads (`Typed`), with no Edit button.
 */
export function ReadmeOverview(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly purpose: string;
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
  const file = readme.data ?? null;
  const sections = readmeSections(file === null || file.truncated ? null : file.contents);
  const whatItIs = sections.whatItIs ?? (props.purpose.trim() || null);

  return (
    <section
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
                    <span className="text-xs text-muted-foreground">{note}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {sections.more.map((section) => (
        <div key={section.heading} className="flex flex-col gap-1.5">
          <h2 className={SECTION_LABEL}>{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="max-w-[75ch] text-sm leading-relaxed text-foreground">
              <Typed words={paragraph} multiline onSave={save}>
                <ReadmeText text={paragraph} onOpenPath={props.onOpenPath} />
              </Typed>
            </p>
          ))}
          {section.items.length === 0 ? null : (
            <ul className="flex list-disc flex-col gap-1 ps-4 text-sm text-foreground">
              {section.items.map((item) => (
                <li key={item}>
                  <Typed words={item} onSave={save}>
                    <ReadmeText text={item} onOpenPath={props.onOpenPath} />
                  </Typed>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Studio writes this from the project's chats and keeps it current. Click a line to change it.
      </p>
    </section>
  );
}
