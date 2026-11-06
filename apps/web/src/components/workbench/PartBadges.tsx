import { Badge } from "../ui/badge";
import { CheckBadge } from "./CheckBadge";
import { checkOutOfDate, type CheckResult } from "./checkResults";
import { KIND_ICONS } from "./kinds";
import { lowerName } from "./partNames";
import type { ProjectFile } from "./projectFiles";

const DrawingIcon = KIND_ICONS.Drawings;
const MadeIcon = KIND_ICONS.Manufacturing;

/** A part or board of a project folder, with how its checks went and what was made from it. */
export interface FolderPart {
  readonly root: string;
  readonly file: ProjectFile;
  readonly results: ReadonlyArray<CheckResult>;
  /** Its checks from before it last changed (`checkOutOfDate`), which pass or fail nothing. */
  readonly outdated: ReadonlyArray<CheckResult>;
  /** Its drawing sheets, relative to the folder. */
  readonly drawings: ReadonlyArray<string>;
  /** What was made to manufacture it: its CAM jobs, G-code, Gerbers (`manufacturingFor`). */
  readonly made: ReadonlyArray<ProjectFile>;
}

/** A part's stand-in until its picture comes: its kind's icon. */
export function PartIcon(props: { readonly file: ProjectFile; readonly className: string }) {
  const Icon = KIND_ICONS[props.file.group];
  return <Icon className={props.className} aria-hidden="true" />;
}

/**
 * What was made to manufacture a part, one of each kind (a CAM job, its G-code, Gerbers), each
 * opening the file that shows it: a toolpath's model before its data.
 */
function madeKinds(files: ReadonlyArray<ProjectFile>) {
  const shown = new Map<string, ProjectFile>();
  for (const file of files) {
    const kept = shown.get(file.kind);
    if (kept === undefined || (/\.glb$/i.test(file.path) && !/\.glb$/i.test(kept.path))) {
      shown.set(file.kind, file);
    }
  }
  return [...shown.values()];
}

/** What was made from a part, as badges that open it: its drawing sheets and manufacturing files. */
export function MadeBadges(props: {
  readonly part: FolderPart;
  readonly onOpen: (path: string) => void;
}) {
  const { part } = props;
  return (
    <>
      {part.drawings.map((drawing) => (
        <button
          key={drawing}
          type="button"
          onClick={() => props.onOpen(drawing)}
          aria-label={`Open the drawing of ${part.file.title}`}
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <Badge variant="outline">
            <DrawingIcon aria-hidden="true" />
            Drawing
          </Badge>
        </button>
      ))}
      {madeKinds(part.made).map((made) => (
        <button
          key={made.path}
          type="button"
          onClick={() => props.onOpen(made.path)}
          aria-label={`Open the ${lowerName(made.kind)} of ${part.file.title}`}
          className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <Badge variant="outline">
            <MadeIcon aria-hidden="true" />
            {made.kind}
          </Badge>
        </button>
      ))}
    </>
  );
}

/**
 * Under a part's card or row: its checks as badges, then what was made from it, each opening what
 * it names, by its path in the part's folder. No badge means no check has run: the lead part says
 * so once (`LeadPart`), not every tile again.
 */
export function PartFooter(props: {
  readonly part: FolderPart;
  readonly onOpen: (path: string) => void;
}) {
  const { part } = props;
  const checks = [...part.results, ...part.outdated];
  if (checks.length + part.drawings.length + part.made.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {checks.map((result) => (
        <CheckBadge
          key={result.path}
          result={result}
          outOfDate={checkOutOfDate(result, part.file)}
          onOpen={() => props.onOpen(result.model)}
        />
      ))}
      <MadeBadges part={part} onOpen={props.onOpen} />
    </div>
  );
}
