/**
 * Studio's part editor for text-to-cad parts. The part's script stays its source; the editor shows
 * what running it made: the model, a timeline read from the code (one row per line of the
 * function that designs the part), the named sizes, and dimensions on the model for the selected
 * row. Changing any of them changes one number in the script (solved back from the value typed
 * when it went through a formula), the part is traced again, and its STEP rebuilt. The page looks
 * for changes every second and a half, cheaply (the server compares the files' hashes), so the
 * agent's edits to the script show up too.
 */
import { FileCode, Ruler, Scan } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { humanName } from "../../../../apps/web/src/components/workbench/partNames";
import type { Bridge, HostContext } from "./bridge";
import { describeError, EditableValue, featureIcon } from "./controls";
import { PartViewport, type ViewportColors } from "./viewport";

interface Param {
  readonly id: string;
  readonly name: string;
  readonly file: string;
  readonly line: number;
  readonly text: string;
  readonly unit: string;
}
interface Input {
  readonly label: string;
  readonly display: string;
  readonly unit: string;
  readonly formula: string;
  readonly leaves: ReadonlyArray<string>;
}
interface Row {
  readonly key: string;
  readonly file: string;
  readonly line: number;
  readonly name: string | null;
  readonly kind: string;
  readonly code: string;
  readonly count: number;
  readonly inputs: ReadonlyArray<Input>;
}
interface Dimension {
  readonly id: string;
  readonly row: string | null;
  readonly name: string;
  readonly label: string;
  readonly display: string;
  readonly formula: string;
  readonly anchor: readonly [number, number, number];
  readonly lines: ReadonlyArray<
    readonly [readonly [number, number, number], readonly [number, number, number]]
  >;
}
interface Building {
  readonly scripts: ReadonlyArray<string>;
  readonly done: number;
  readonly error: string | null;
}
interface PartState {
  readonly ok: boolean;
  readonly unchanged?: boolean;
  readonly error?: string;
  readonly choose?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly line: number;
  }>;
  readonly change?: {
    readonly name: string;
    readonly file: string;
    readonly line: number;
    readonly from: string;
    readonly to: string;
  };
  readonly name?: string;
  readonly units?: string;
  readonly files?: Readonly<Record<string, string>>;
  readonly params?: ReadonlyArray<Param>;
  readonly rows?: ReadonlyArray<Row>;
  readonly dimensions?: ReadonlyArray<Dimension>;
  readonly mesh?: string | null;
  readonly building?: Building;
}
interface PartEntry {
  readonly script: string;
  readonly path: string;
  readonly name: string;
}
/** A pending edit that needs the engineer to say which size to change. */
interface Choice {
  readonly request: Record<string, unknown>;
  readonly options: NonNullable<PartState["choose"]>;
}

const POLL_MS = 1500;

function readColors(): ViewportColors {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.dataset.theme !== "light";
  return {
    background: get("--viewport", dark ? "#1b1c1f" : "#f4f5f7"),
    model: dark ? "#c9cdd4" : "#d5d9e0",
    edge: dark ? "#2b2e34" : "#4a4f58",
    dimension: get("--accent", "#5b9cff"),
    dimensionActive: dark ? "#ffffff" : "#111111",
  };
}

function applyContext(context: HostContext) {
  const root = document.documentElement;
  root.dataset.theme = context.theme ?? "dark";
  for (const [name, value] of Object.entries(context.styles?.variables ?? {})) {
    root.style.setProperty(name, value);
  }
}

const UNIT_WORDS: Record<string, string> = {
  mm: "Millimeters",
  in: "Inches",
  cm: "Centimeters",
  m: "Meters",
};

/** A size's name as an engineer says it: `TRAY_HEIGHT` reads "Tray height"; a bare number stays. */
const sizeName = (name: string) => (/^[A-Za-z_]\w*$/.test(name) ? humanName(name) : name);

const withUnit = (display: string, unit: string) => (unit === "" ? display : `${display} ${unit}`);

/** Which size to change, when the value typed goes through a formula of several. */
function ChooseSize(props: {
  readonly choice: Choice;
  readonly onPick: (leaf: string) => void;
  readonly onCancel: () => void;
}) {
  return (
    <div className="choose" role="dialog" aria-label="Which size to change">
      <p>That value comes from a formula. Change which size?</p>
      <div className="choose-options">
        {props.choice.options.map((option) => (
          <button
            key={option.id}
            type="button"
            className="choose-option"
            onClick={() => props.onPick(option.id)}
          >
            {sizeName(option.name)}
          </button>
        ))}
        <button type="button" className="link" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function DimensionChips(props: {
  readonly viewport: PartViewport;
  readonly dimensions: ReadonlyArray<Dimension>;
  readonly onActive: (id: string | null) => void;
  readonly onChange: (dimension: Dimension, text: string) => Promise<void>;
}) {
  const [, setFrame] = useState(0);
  useEffect(
    () => props.viewport.subscribe(() => setFrame(props.viewport.version)),
    [props.viewport],
  );
  return (
    <div className="chips">
      {props.dimensions.map((dimension) => {
        const at = props.viewport.project(dimension.anchor);
        if (!at.visible) return null;
        return (
          <div
            key={dimension.id}
            className="chip"
            style={{ transform: `translate(${at.x}px, ${at.y}px) translate(-50%, -50%)` }}
          >
            <EditableValue
              label={sizeName(dimension.name)}
              hint={
                dimension.formula === dimension.display
                  ? "Double-click to change"
                  : `${dimension.formula}. Double-click to change`
              }
              expression={dimension.display}
              display={dimension.label}
              onActive={(active) => props.onActive(active ? dimension.id : null)}
              onCommit={(text) => props.onChange(dimension, text)}
            />
          </div>
        );
      })}
    </div>
  );
}

function PartPicker(props: { readonly bridge: Bridge; readonly onPick: (script: string) => void }) {
  const [parts, setParts] = useState<ReadonlyArray<PartEntry> | null>(null);
  useEffect(() => {
    void props.bridge
      .call<{ parts: ReadonlyArray<PartEntry> }>("part_list", {})
      .then((reply) => setParts(reply.parts))
      .catch(() => setParts([]));
  }, [props.bridge]);
  return (
    <div className="picker">
      <h2>Edit a part</h2>
      {parts === null ? (
        <p className="hint">Looking for the project's parts</p>
      ) : parts.length === 0 ? (
        <p className="hint">No parts in this project yet. Ask the agent for one in the chat.</p>
      ) : (
        <ul className="rows">
          {parts.map((part) => (
            <li key={part.script} className="row">
              <button
                type="button"
                className="row-name pick"
                onClick={() => props.onPick(part.script)}
              >
                {humanName(part.name)}
              </button>
              <span className="row-formula">{part.path}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function App(props: { readonly bridge: Bridge; readonly context: HostContext }) {
  const { bridge } = props;
  const [script, setScript] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<PartState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [showDimensions, setShowDimensions] = useState(true);
  const [activeDimension, setActiveDimension] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [viewport, setViewport] = useState<PartViewport | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const files = useRef<Readonly<Record<string, string>> | undefined>(undefined);
  const framed = useRef<string | null>(null);

  // The part the tab was opened on; none: the picker.
  useEffect(() => {
    const off = bridge.onOpened((result) => {
      const opened = result.structuredContent as { script?: string | null } | undefined;
      setScript(typeof opened?.script === "string" ? opened.script : null);
    });
    const fallback = window.setTimeout(
      () => setScript((current) => (current === undefined ? null : current)),
      600,
    );
    return () => {
      off();
      window.clearTimeout(fallback);
    };
  }, [bridge]);

  const take = useCallback((reply: PartState) => {
    if (reply.unchanged) {
      if (reply.building)
        setState((current) =>
          current === null ? current : { ...current, building: reply.building },
        );
      return;
    }
    if (!reply.ok) {
      setProblem(reply.error ?? "The part could not be read.");
      if (reply.building)
        setState((current) =>
          current === null ? current : { ...current, building: reply.building },
        );
      return;
    }
    files.current = reply.files;
    setState(reply);
    setProblem(null);
  }, []);

  const refresh = useCallback(
    async (force = false) => {
      if (typeof script !== "string") return;
      try {
        take(
          await bridge.call<PartState>("part_state", {
            script,
            ...(force ? {} : { files: files.current }),
          }),
        );
      } catch (cause) {
        setProblem(describeError(cause));
      }
    },
    [bridge, script, take],
  );

  useEffect(() => {
    if (typeof script !== "string") return;
    files.current = undefined;
    void refresh(true);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [script, refresh]);

  useEffect(() => {
    if (host.current === null) return;
    const created = new PartViewport(host.current, readColors());
    setViewport(created);
    const off = bridge.onContext((context) => {
      applyContext(context);
      created.setColors(readColors());
    });
    return () => {
      off();
      created.dispose();
    };
  }, [bridge, script]);

  useEffect(() => {
    viewport?.setMesh(state?.mesh ?? null);
  }, [viewport, state?.mesh]);

  const rows = state?.rows ?? [];
  const rowsWithDimensions = useMemo(
    () => new Set((state?.dimensions ?? []).map((dimension) => dimension.row)),
    [state?.dimensions],
  );
  // The selected row's dimensions; none selected, the first row that has any (the part's base).
  const shownRow = selected ?? rows.find((row) => rowsWithDimensions.has(row.key))?.key ?? null;
  const dimensions = useMemo(
    () =>
      showDimensions
        ? (state?.dimensions ?? []).filter((dimension) => dimension.row === shownRow)
        : [],
    [state?.dimensions, showDimensions, shownRow],
  );
  useEffect(() => {
    viewport?.setDimensions(
      dimensions.map((dimension) => ({ key: dimension.id, lines: dimension.lines })),
      activeDimension,
    );
  }, [viewport, dimensions, activeDimension]);
  useEffect(() => {
    if (
      viewport === null ||
      typeof script !== "string" ||
      !state?.mesh ||
      framed.current === script
    )
      return;
    framed.current = script;
    viewport.fit();
  }, [viewport, script, state?.mesh]);

  const edit = useCallback(
    async (request: Record<string, unknown>) => {
      if (typeof script !== "string") return;
      setSaving(true);
      try {
        const reply = await bridge.call<PartState>("part_edit", {
          ...request,
          script,
          files: files.current,
        });
        if (reply.choose) {
          setChoice({ request, options: reply.choose });
          return;
        }
        if (!reply.ok) throw new Error(reply.error ?? "The change could not be made.");
        take(reply);
        if (reply.change) {
          const { name, from, to, file, line } = reply.change;
          const said = sizeName(name) === name ? name : `${sizeName(name)} (${name})`;
          void bridge
            .tellThread(
              `In the part editor I changed ${said} from ${from} to ${to} (${file}, line ${line}).`,
            )
            .catch(() => {});
        }
      } finally {
        setSaving(false);
      }
    },
    [bridge, script, take],
  );

  const units = state?.units ?? "mm";
  const building = state?.building;
  const status = saving
    ? "Rebuilding"
    : problem !== null
      ? "Could not build"
      : building && building.done < building.scripts.length
        ? `Updating STEP files, ${building.done} of ${building.scripts.length}`
        : building?.error
          ? "A STEP file did not rebuild"
          : state === null
            ? "Opening"
            : "Saved";

  if (script === null) {
    return (
      <div className="editor">
        <PartPicker bridge={bridge} onPick={setScript} />
      </div>
    );
  }

  return (
    <div className="editor">
      <header className="bar">
        <div className="title">
          <span className="name">{state?.name ? humanName(state.name) : "Part editor"}</span>
          <span className="meta">
            Part · {UNIT_WORDS[units] ?? units} ·{" "}
            <span className={`status ${problem !== null || building?.error ? "error" : "ok"}`}>
              {status}
            </span>
          </span>
        </div>
        <div className="tools">
          <button
            type="button"
            className="icon"
            data-tip={showDimensions ? "Hide dimensions" : "Show dimensions"}
            aria-label={showDimensions ? "Hide dimensions" : "Show dimensions"}
            aria-pressed={showDimensions}
            onClick={() => setShowDimensions((value) => !value)}
          >
            <Ruler size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="icon"
            data-tip="Fit the model"
            aria-label="Fit the model"
            onClick={() => viewport?.fit()}
          >
            <Scan size={15} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="body">
        <div className="view" ref={host}>
          {viewport === null ? null : (
            <DimensionChips
              viewport={viewport}
              dimensions={dimensions}
              onActive={setActiveDimension}
              onChange={(dimension, text) => edit({ dimension: dimension.id, text })}
            />
          )}
          {problem === null ? null : <p className="problem">{problem}</p>}
          {building?.error ? <p className="problem">{building.error}</p> : null}
          {choice === null ? null : (
            <ChooseSize
              choice={choice}
              onCancel={() => setChoice(null)}
              onPick={(leaf) => {
                const pending = choice;
                setChoice(null);
                void edit({ ...pending.request, leaf }).catch((cause) =>
                  setProblem(describeError(cause)),
                );
              }}
            />
          )}
        </div>

        <aside className="side">
          <section aria-label="Parameters">
            <h2>Parameters</h2>
            {state === null ? (
              <p className="hint">Reading the part</p>
            ) : (state.params ?? []).length === 0 ? (
              <p className="hint">
                No named sizes. Ask the agent to name the sizes that matter at the top of the
                script.
              </p>
            ) : (
              <ul className="rows">
                {(state.params ?? []).map((param) => (
                  <li key={param.id} className="row parameter">
                    <span className="row-name">{sizeName(param.name)}</span>
                    <EditableValue
                      label={sizeName(param.name)}
                      expression={param.text}
                      display={withUnit(param.text, param.unit)}
                      onCommit={(text) => edit({ literal: param.id, text })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Timeline">
            <h2>Timeline</h2>
            <ul className="features">
              {rows.map((row) => {
                const isSelected = shownRow === row.key && selected !== null;
                return (
                  <li key={row.key} className={`feature ${isSelected ? "selected" : ""}`}>
                    <div className="feature-line">
                      <button
                        type="button"
                        className="feature-main"
                        aria-pressed={isSelected}
                        onClick={() =>
                          setSelected((current) => (current === row.key ? null : row.key))
                        }
                      >
                        <span className="feature-icon">{featureIcon(row.kind)}</span>
                        <span className="feature-name">
                          {row.name ? humanName(row.name) : row.kind}
                        </span>
                        <span className="feature-kind">
                          {row.name ? row.kind : ""}
                          {row.count > 1 ? ` ×${row.count}` : ""}
                        </span>
                      </button>
                    </div>
                    {isSelected ? (
                      <>
                        <ul className="inputs">
                          {row.inputs.map((input, index) => (
                            <li key={`${input.label}:${index}`} className="row">
                              <span className="row-name">{input.label}</span>
                              {input.formula === input.display ? null : (
                                <span className="row-formula">{input.formula}</span>
                              )}
                              <EditableValue
                                label={`${row.name ?? row.kind} ${input.label}`}
                                expression={input.display}
                                display={withUnit(input.display, input.unit)}
                                onCommit={(text) => edit({ input: { row: row.key, index }, text })}
                              />
                            </li>
                          ))}
                        </ul>
                        <p className="code-ref">
                          <FileCode size={12} aria-hidden="true" />
                          {row.file.split("/").pop()} line {row.line}
                        </p>
                      </>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}
