import type { EnvironmentId } from "@t3tools/contracts";
import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { useDocumentTemplates } from "./documentTemplates";
import { NewDialog, type NewJob, useNewDialogStore } from "./NewDialog";
import { availableTemplates } from "./newTemplates";

/**
 * New, as Google Drive's New is: a part, an assembly, a board, a harness or a document
 * (`NewDialog`). The same button and dialog in both places it is: first in a project's panel
 * toolbar, where Create hands the job to the open chat, and on Home, where it starts a new project
 * with the job as its first message. It also opens when asked from elsewhere
 * (`useNewDialogStore`: the Document menu's From a template).
 */
export function StudioNew(props: {
  readonly environmentId: EnvironmentId;
  /** The open project's folder; empty on Home. */
  readonly cwd: string;
  /** On Home: Create makes a new project. */
  readonly newProject?: boolean;
  readonly onCreate: (job: NewJob) => void;
}) {
  const { environmentId } = props;
  const plugins = useEnvironmentQuery(pluginEnvironment.list({ environmentId, input: {} })).data
    ?.plugins;
  const templates = useMemo(
    () =>
      availableTemplates(
        new Set((plugins ?? []).flatMap((plugin) => (plugin.enabled ? plugin.skills : []))),
      ).filter((template) => template.source === "new"),
    [plugins],
  );
  const documents = useDocumentTemplates(environmentId);
  const [opened, setOpened] = useState({ open: false, count: 0 });
  const asked = useNewDialogStore((store) => store.request);
  const takeAsked = useNewDialogStore((store) => store.take);
  const discipline = asked?.discipline ?? null;

  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpened((current) => ({ open: true, count: current.count + 1 }))}
      >
        <PlusIcon aria-hidden="true" />
        New
      </Button>
      {opened.open || asked !== null ? (
        <NewDialog
          key={`${opened.count}:${asked === null ? "" : (discipline ?? "first")}`}
          open
          onOpenChange={(open) => {
            if (open) return;
            takeAsked();
            setOpened((current) => ({ ...current, open: false }));
          }}
          environmentId={environmentId}
          cwd={props.cwd}
          templates={templates}
          fileTemplates={documents.templates}
          onAddTemplate={documents.add}
          onShowTemplates={documents.show}
          {...(discipline === null ? {} : { initialDiscipline: discipline })}
          initialTemplateId={null}
          parts={[]}
          {...(props.newProject ? { newProject: true } : {})}
          onCreate={props.onCreate}
        />
      ) : null}
    </>
  );
}
