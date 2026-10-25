import { BotIcon, GlobeIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../../ui/tooltip";
import { FileKindIcon } from "../FileKindIcon";
import { useEngineeringInterface } from "../studioInterface";
import { referenceLabel, type AnswerReference } from "./turnReferences";

/**
 * The References under an answer, in the engineering interface: what the answer cites, or what
 * its turn opened, each with when the agent opened it (`turnReferences`). It reads as a sibling
 * of the "Changed" line (`TurnDesignChanges`), which replaces the changed-files card there: the
 * same margin and a quiet heading, with no frame of its own.
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

/** A file wears its kind's icon, as the panel's tabs do; a page the chat's icon for links. */
function ReferenceIcon(props: { readonly target: AnswerReference["target"] }) {
  const { target } = props;
  if (target.kind === "file") return <FileKindIcon path={target.path} className="size-3.5" />;
  const Icon = target.kind === "url" ? GlobeIcon : BotIcon;
  return <Icon aria-hidden="true" className={cn("size-3.5 shrink-0", QUIET)} />;
}

/**
 * One reference: its number, its icon, its name, where in it, and when it was opened. The row is
 * one element, with its text in full on hover while it truncates.
 */
function ReferenceRow(props: { readonly reference: AnswerReference }) {
  const { reference } = props;
  const { name, where } = referenceLabel(reference);
  // What the agent did not open, or knew without opening, reads quieter. It is not a failure.
  const quiet = reference.opened === "not opened" || reference.opened === "own knowledge";
  const row = (
    <div className="flex min-w-0 items-center gap-2 py-0.5 text-xs">
      <span className="w-4 shrink-0 text-right tabular-nums text-muted-foreground">
        {reference.n}
      </span>
      <ReferenceIcon target={reference.target} />
      <span className="min-w-0 truncate text-foreground">{name}</span>
      {where === null ? null : (
        <span className="min-w-0 truncate text-muted-foreground">{where}</span>
      )}
      <span className={cn("ms-auto shrink-0 ps-2", quiet ? QUIET : "text-foreground")}>
        {reference.opened}
      </span>
    </div>
  );
  return (
    <li className="min-w-0">
      <Tooltip>
        <TooltipTrigger render={row} />
        <TooltipPopup side="top">{where === null ? name : `${name}, ${where}`}</TooltipPopup>
      </Tooltip>
    </li>
  );
}

export const AnswerReferences = memo(function AnswerReferences(props: {
  readonly references: ReadonlyArray<AnswerReference> | null;
}) {
  if (props.references === null) return null;
  return (
    <section aria-label="References" className="mt-3 flex min-w-0 flex-col gap-1">
      <h3 className="text-xs text-muted-foreground">References</h3>
      <ol className="flex min-w-0 flex-col">
        {props.references.map((reference) => (
          <ReferenceRow key={reference.n} reference={reference} />
        ))}
      </ol>
    </section>
  );
});
