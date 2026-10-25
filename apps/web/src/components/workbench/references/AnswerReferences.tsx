import { BotIcon, GlobeIcon, type LucideIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";
import { FILE_ICONS, fileIconKey, KIND_TINTS } from "../kinds";
import { classifyProjectFile } from "../projectFiles";
import { useEngineeringInterface } from "../studioInterface";
import { normalizePath, referenceLabel, type AnswerReference } from "./turnReferences";

/**
 * The References under an answer, in the engineering interface: what the answer cites, or what
 * its turn opened, each with when the agent opened it (`turnReferences`). The frame takes the
 * changed-files card's radius, header row and type sizes, in the hairline the turn's change
 * chips beside it are drawn with.
 */

const QUIET = "text-muted-foreground";

/**
 * The references to list under an answer: its own, in the engineering interface, when it has some.
 * The answer's Sources block is left out of its text where this list shows.
 */
export function useShownReferences(
  references: ReadonlyArray<AnswerReference> | undefined,
): ReadonlyArray<AnswerReference> | null {
  const engineering = useEngineeringInterface();
  return engineering && references !== undefined && references.length > 0 ? references : null;
}

/**
 * A file takes its kind's icon in its kind's color, as the change chips do; a page takes the
 * chat's icon for links, and own knowledge the agent's icon.
 */
function referenceIcon(reference: AnswerReference): { Icon: LucideIcon; tint: string } {
  const { target } = reference;
  if (target.kind === "url") return { Icon: GlobeIcon, tint: QUIET };
  if (target.kind === "own") return { Icon: BotIcon, tint: QUIET };
  const key = fileIconKey(classifyProjectFile(normalizePath(target.path))?.kind ?? "File");
  return { Icon: FILE_ICONS[key], tint: key === "Setup" ? QUIET : KIND_TINTS[key] };
}

/** One reference: its number, its kind's icon, its name, where in it, and when it was opened. */
function ReferenceRow(props: { readonly reference: AnswerReference }) {
  const { reference } = props;
  const { Icon, tint } = referenceIcon(reference);
  const { name, where } = referenceLabel(reference);
  // What the agent did not open, or knew without opening, reads quieter. It is not a failure.
  const quiet = reference.opened === "not opened" || reference.opened === "own knowledge";
  return (
    <li className="min-w-0">
      <div className="flex min-w-0 items-center gap-2 px-3 py-1.5 text-xs">
        <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">
          {reference.n}
        </span>
        <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", tint)} />
        <span className="min-w-0 truncate text-foreground">{name}</span>
        {where === null ? null : (
          <span className="min-w-0 truncate text-muted-foreground">{where}</span>
        )}
        <span className={cn("ms-auto shrink-0 ps-2", quiet ? QUIET : "text-foreground")}>
          {reference.opened}
        </span>
      </div>
    </li>
  );
}

export const AnswerReferences = memo(function AnswerReferences(props: {
  readonly references: ReadonlyArray<AnswerReference> | null;
}) {
  if (props.references === null) return null;
  return (
    <section
      aria-label="References"
      className="mt-3 min-w-0 overflow-hidden rounded-lg border border-border"
    >
      <h3 className="px-3 py-2 text-xs font-medium text-foreground">References</h3>
      <ol className="divide-y divide-border border-t border-border">
        {props.references.map((reference) => (
          <ReferenceRow key={reference.n} reference={reference} />
        ))}
      </ol>
    </section>
  );
});
