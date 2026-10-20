import type { EnvironmentId } from "@t3tools/contracts";

import { useWorkspaceMutationRefresh } from "~/hooks/useWorkspaceMutationRefresh";
import { projectEnvironment } from "~/state/projects";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { type ReadmeDecision, readmeSections } from "./projectReadme";

const SECTION_LABEL = "text-2xs font-medium tracking-widest text-muted-foreground uppercase";

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
 * (`studioProjectContext`); the person can edit it too.
 */
export function ReadmeOverview(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly purpose: string;
  /** Changes when the thread's agent changes files, the README among them. */
  readonly mutationId: string | null;
  readonly onOpenReadme: () => void;
}) {
  const readme = useEnvironmentQuery(
    projectEnvironment.readFile({
      environmentId: props.environmentId,
      input: { cwd: props.cwd, relativePath: "README.md" },
    }),
  );
  useWorkspaceMutationRefresh({
    mutationId: props.mutationId,
    refresh: readme.refresh,
    resourceKey: `studio-readme:${props.cwd}`,
  });
  const file = readme.data ?? null;
  const sections = readmeSections(file === null || file.truncated ? null : file.contents);
  const whatItIs = sections.whatItIs ?? (props.purpose.trim() || null);

  return (
    <section aria-label="README" className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className={SECTION_LABEL}>What it is</h2>
        {whatItIs === null ? (
          <p className="text-sm text-muted-foreground">
            Not written yet. Studio writes it from the project's chats.
          </p>
        ) : (
          <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">{whatItIs}</p>
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
                  <span>{decision.text}</span>
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
            <p key={paragraph} className="text-sm leading-relaxed text-foreground">
              {paragraph}
            </p>
          ))}
          {section.items.length === 0 ? null : (
            <ul className="flex list-disc flex-col gap-1 ps-4 text-sm text-foreground">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Studio writes this from the project's chats and keeps it current.</span>
        {file === null ? null : (
          <Button variant="outline" size="xs" onClick={props.onOpenReadme}>
            Edit the README
          </Button>
        )}
      </div>
    </section>
  );
}
