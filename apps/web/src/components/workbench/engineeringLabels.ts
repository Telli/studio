/**
 * The agent's steps in an engineer's words, for the engineering interface: a
 * shell command reads as what it did to the design ("FEA study on
 * bracket.step", "Built bracket") instead of the command line. The command
 * itself stays one click away, in the step's details.
 */

export interface StepLabel {
  /** Settled: "FEA study on bracket.step". */
  readonly done: string;
  /** In progress: "Running an FEA study on bracket.step". */
  readonly doing: string;
}

const base = (path: string) =>
  path
    .replace(/^["']|["']$/g, "")
    .split(/[\\/]/)
    .pop() ?? path;

/** The first argument after `marker` that names a file of these endings. */
function fileAfter(command: string, marker: RegExp, endings: RegExp): string | null {
  const at = command.search(marker);
  if (at < 0) return null;
  for (const token of command.slice(at).split(/\s+/)) {
    if (endings.test(token.replace(/["']/g, ""))) return base(token);
  }
  return null;
}

const STEP = /\.(?:step|stp)$/i;
const BOARD = /\.(?:kicad_pcb|kicad_sch)$/i;
const of = (file: string | null, joiner: string) => (file === null ? "" : ` ${joiner} ${file}`);

const RULES: ReadonlyArray<(command: string) => StepLabel | null> = [
  (command) => {
    if (!/\bfea\s+solve\b/.test(command)) return null;
    const file = of(fileAfter(command, /\bsolve\b/, STEP), "on");
    return { done: `FEA study${file}`, doing: `Running an FEA study${file}` };
  },
  (command) => {
    if (!/\bfea\s+faces\b/.test(command)) return null;
    const file = of(fileAfter(command, /\bfaces\b/, STEP), "of");
    return { done: `Listed the faces${file}`, doing: `Listing the faces${file}` };
  },
  (command) => {
    if (!/\bfea\s+parts\b/.test(command)) return null;
    const file = of(fileAfter(command, /\bparts\b/, STEP), "of");
    return { done: `Listed the parts${file}`, doing: `Listing the parts${file}` };
  },
  (command) => {
    if (!/\bcam\s+plan\b/.test(command)) return null;
    const file = of(fileAfter(command, /\bplan\b/, STEP), "for");
    return { done: `CAM plan${file}`, doing: `Planning the CAM job${file}` };
  },
  (command) => {
    if (!/\bcam\s+features\b/.test(command)) return null;
    const file = of(fileAfter(command, /\bfeatures\b/, STEP), "of");
    return {
      done: `Found the machinable features${file}`,
      doing: `Finding machinable features${file}`,
    };
  },
  (command) => {
    const verb = /\bpcb\s+(validate|review|gerber|bom|pos)\b/.exec(command)?.[1];
    if (verb === undefined) return null;
    const file = fileAfter(command, /\bpcb\b/, BOARD);
    const what = {
      validate: ["Checked the board", "Checking the board"],
      review: ["Reviewed the board", "Reviewing the board"],
      gerber: ["Wrote the Gerbers", "Writing the Gerbers"],
      bom: ["Wrote the bill of materials", "Writing the bill of materials"],
      pos: ["Wrote the pick-and-place file", "Writing the pick-and-place file"],
    }[verb as "validate" | "review" | "gerber" | "bom" | "pos"];
    return { done: `${what[0]}${of(file, "for")}`, doing: `${what[1]}${of(file, "for")}` };
  },
  (command) => {
    if (!/\b(?:snapshot|render)\b/.test(command) || !/\bcadgen\b/.test(command)) return null;
    return { done: "Took a picture of the model", doing: "Taking a picture of the model" };
  },
  // A model script builds its part: `python bracket.py`, through any interpreter or cadgen.
  (command) => {
    const script =
      /\b(?:python3?|cadgen(?:\.cli)?\s+build)\s+(?:-\S+\s+)*["']?([^\s"']+\.py)\b/.exec(
        command,
      )?.[1];
    if (script === undefined) return null;
    const name = base(script).replace(/\.py$/, "");
    return { done: `Built ${name}`, doing: `Building ${name}` };
  },
  (command) => {
    const verb = /\bcadgen(?:\.cli)?\s+([a-z][\w-]*)/.exec(command)?.[1];
    if (verb === undefined) return null;
    return { done: `CAD tools: ${verb}`, doing: `CAD tools: ${verb}` };
  },
  (command) =>
    /^(?:ls|find|cat|head|tail|grep|rg|fd|tree|wc|sed\s+-n|file|stat|du)\b/.test(command)
      ? { done: "Looked through the project", doing: "Looking through the project" }
      : null,
  (command) =>
    /^(?:mkdir|cp|mv|rm|touch|ln)\b/.test(command)
      ? { done: "Organized the project's files", doing: "Organizing the project's files" }
      : null,
  (command) =>
    /^(?:pip3?|uv|uvx|npm|npx|pnpm|brew)\b/.test(command)
      ? { done: "Set up tools", doing: "Setting up tools" }
      : null,
  (command) =>
    /^git\b/.test(command)
      ? { done: "Recorded the project's history", doing: "Recording the project's history" }
      : null,
];

/** The last command of a chain is what it was for: `cd parts && python bracket.py` builds. */
function mainCommand(command: string): string {
  const parts = command
    .split(/\s*(?:&&|\|\||;)\s*/)
    .map((part) => part.trim().replace(/^(?:\w+=\S*\s+)+/, ""))
    .filter((part) => part !== "" && !/^(?:cd|export|source|set)\b/.test(part));
  return parts.at(-1) ?? command.trim();
}

export function engineeringStepLabel(command: string): StepLabel {
  const whole = command.trim();
  for (const rule of RULES) {
    const label = rule(whole);
    if (label !== null) return label;
  }
  const main = mainCommand(whole);
  for (const rule of RULES) {
    const label = rule(main);
    if (label !== null) return label;
  }
  return { done: "Worked on the design", doing: "Working on the design" };
}

/** A group of steps in an engineer's words: "Ran 3 commands" reads "3 steps". */
export function engineeringGroupLabel(label: string): string {
  const cased = (word: string, like: string) =>
    like[0] === like[0]?.toUpperCase() ? word[0]!.toUpperCase() + word.slice(1) : word;
  return label
    .replace(/\b([Rr])an (\d+) commands?\b/g, (_m, _r: string, count: string) =>
      count === "1" ? "1 step" : `${count} steps`,
    )
    .replace(
      /\b([Cc]hanged) (\d+) (files?)\b/g,
      (_m, verb: string, count: string, noun: string) =>
        `${cased("updated", verb)} ${count} ${noun}`,
    )
    .replace(/\b([Ss]earched) code\b/g, (_m, verb: string) => `${verb} the project`)
    .replace(
      /\b([Rr]ead) (\d+) (files?)\b/g,
      (_m, verb: string, count: string, noun: string) =>
        `${cased("looked at", verb)} ${count} ${noun}`,
    );
}
