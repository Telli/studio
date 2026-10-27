import type { StudioSample } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { DownloadIcon, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { ExampleCard } from "./examples/ExampleCard";
import { readGetStartedFolded, writeGetStartedFolded } from "./homeStart";
import { CHAT_ICON, KIND_ICONS, KIND_TINTS } from "./kinds";
import { HeadingLink, MODULE_HEADING, OverviewModule } from "./OverviewModules";

/** Home's tiles, four across on a wide window: the project tiles and the examples line up. */
export const TILE_GRID = "grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4";
/** How many examples the Get started strip shows: one row; All examples has every one. */
const STRIP_EXAMPLES = 4;

/** One of the start page's three ways in: a big card, its icon over what it does and a line more. */
function StartChoice(props: {
  readonly icon: LucideIcon;
  readonly tint?: string;
  readonly label: string;
  readonly note: string;
  readonly disabled?: boolean;
  readonly onChoose: () => void;
}) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      onClick={props.onChoose}
      disabled={props.disabled}
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-xs/5 outline-none transition-colors duration-150 enabled:hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default disabled:opacity-64"
    >
      <Icon aria-hidden="true" className={cn("size-6", props.tint ?? "text-foreground/75")} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium text-foreground">{props.label}</span>
        <span className="text-sm text-muted-foreground">{props.note}</span>
      </span>
    </button>
  );
}

/**
 * The start page's three ways in (`homeLayout` is `start`), as Vizcom's start page has them: New
 * part (a project with a starter part, open in CAD mode at once: `useNewPart`), Import a STEP (Import's picker; `onImport` null where there is no desktop app to read this
 * computer's files) and Describe it to the AI (Home's box, under these, takes the typing). Scan
 * this computer, Import's other way in, sits under them.
 */
export function StartChoices(props: {
  readonly onNewPart: () => void;
  readonly onImport: (() => void) | null;
  readonly onScan: (() => void) | null;
  readonly onDescribe: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StartChoice
          icon={KIND_ICONS.CAD}
          tint={KIND_TINTS.CAD}
          label="New part"
          note="Opens in CAD mode on a block to shape by its sizes."
          onChoose={props.onNewPart}
        />
        <StartChoice
          icon={DownloadIcon}
          label="Import a STEP"
          note={props.onImport === null ? "Needs the desktop app." : "Or drop files here."}
          disabled={props.onImport === null}
          onChoose={() => props.onImport?.()}
        />
        <StartChoice
          icon={CHAT_ICON}
          tint={KIND_TINTS.Chats}
          label="Describe it to the AI"
          note='"A phone stand for my desk"'
          onChoose={props.onDescribe}
        />
      </div>
      {props.onScan === null ? null : (
        <p className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
          Studio can also find the CAD already on this computer and group it into projects.
          <HeadingLink label="Scan this computer" onClick={props.onScan} />
        </p>
      )}
    </div>
  );
}

/** The examples as cards in Home's grid, each opening its page (`/examples/$id`). */
function ExampleTiles(props: { readonly examples: ReadonlyArray<StudioSample> }) {
  const navigate = useNavigate();
  return (
    <div className={TILE_GRID}>
      {props.examples.map((sample) => (
        <ExampleCard
          key={sample.id}
          sample={sample}
          onOpen={() => void navigate({ to: "/examples/$id", params: { id: sample.id } })}
        />
      ))}
    </div>
  );
}

/** The start page's examples, under its three ways in: every one, to open and make a copy of. */
export function StartExamples(props: { readonly examples: ReadonlyArray<StudioSample> }) {
  if (props.examples.length === 0) return null;
  return (
    <section aria-label="Start from an example" className="flex min-w-0 flex-col gap-3">
      <h2 className={MODULE_HEADING}>Start from an example</h2>
      <ExampleTiles examples={props.examples} />
    </section>
  );
}

/**
 * Home's Get started strip, under Starred and Recent once there are projects: a row of the
 * examples, with All examples (the Examples page). It folds away as an Overview module does, and
 * the fold is kept on this device (`readGetStartedFolded`).
 */
export function GetStarted(props: { readonly examples: ReadonlyArray<StudioSample> }) {
  const navigate = useNavigate();
  const [folded, setFolded] = useState(readGetStartedFolded);
  if (props.examples.length === 0) return null;
  return (
    <OverviewModule
      title="Get started"
      folded={folded}
      onFold={() => {
        setFolded(!folded);
        writeGetStartedFolded(!folded);
      }}
      action={
        <HeadingLink label="All examples" onClick={() => void navigate({ to: "/examples" })} />
      }
    >
      <div className="pt-3">
        <ExampleTiles examples={props.examples.slice(0, STRIP_EXAMPLES)} />
      </div>
    </OverviewModule>
  );
}
