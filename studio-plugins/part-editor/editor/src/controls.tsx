/**
 * The part editor's controls, shared by its pages: a value an engineer changes in place, and a
 * feature's icon by what it is.
 */
import {
  Box,
  CircleDot,
  FlipHorizontal2,
  Grid3x3,
  Layers,
  Move,
  PencilRuler,
  RotateCw,
  Scissors,
  Squircle,
  SquarePlus,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

export const describeError = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** A value an engineer changes in place: double-click, type a number or a formula, Enter. */
export function EditableValue(props: {
  readonly expression: string;
  readonly display: string;
  readonly onCommit: (expression: string) => Promise<void>;
  readonly onActive?: (active: boolean) => void;
  readonly label: string;
  readonly hint?: string;
  readonly className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.expression);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  const start = () => {
    setDraft(props.expression);
    setError(null);
    setEditing(true);
    props.onActive?.(true);
  };
  const stop = () => {
    setEditing(false);
    props.onActive?.(false);
  };
  const commit = async () => {
    const next = draft.trim();
    if (next === "" || next === props.expression) return stop();
    setBusy(true);
    try {
      await props.onCommit(next);
      stop();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        className={`value ${props.className ?? ""}`}
        data-tip={props.hint ?? "Double-click to change"}
        aria-label={`${props.label}, ${props.display}. Double-click to change`}
        onDoubleClick={start}
        onKeyDown={(event) => {
          if (event.key === "Enter") start();
        }}
        onMouseEnter={() => props.onActive?.(true)}
        onMouseLeave={() => props.onActive?.(false)}
      >
        {props.display}
      </button>
    );
  }
  return (
    <span className={`value-edit ${props.className ?? ""}`}>
      <input
        ref={input}
        value={draft}
        disabled={busy}
        aria-label={`New value for ${props.label}`}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (!busy) stop();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") void commit();
          if (event.key === "Escape") stop();
        }}
      />
      {error === null ? null : <span className="value-error">{error}</span>}
    </span>
  );
}

export function featureIcon(kind: string): ReactNode {
  const props = { size: 14, "aria-hidden": true } as const;
  if (kind === "Sketch") return <PencilRuler {...props} />;
  if (/extrude/i.test(kind)) return <Box {...props} />;
  if (/revolve/i.test(kind)) return <RotateCw {...props} />;
  if (/hole|thread/i.test(kind)) return <CircleDot {...props} />;
  if (/pattern/i.test(kind)) return <Grid3x3 {...props} />;
  if (/fillet|chamfer/i.test(kind)) return <Squircle {...props} />;
  if (/mirror/i.test(kind)) return <FlipHorizontal2 {...props} />;
  if (/cut/i.test(kind)) return <Scissors {...props} />;
  if (/join/i.test(kind)) return <SquarePlus {...props} />;
  if (/place|move/i.test(kind)) return <Move {...props} />;
  return <Layers {...props} />;
}
