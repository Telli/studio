import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";

import type { ComposerHandleRef } from "~/composerHandleContext";
import { useRightPanelStore } from "~/rightPanelStore";
import { pluginEnvironment } from "~/state/plugins";
import { useEnvironmentQuery } from "~/state/query";
import { Button } from "../ui/button";
import { useDocumentTemplates } from "./documentTemplates";
import { NewDialog, useNewDialogStore } from "./NewDialog";
import { availableTemplates } from "./newTemplates";

/**
 * New, first in the panel's toolbar and always there in the engineering interface, as Google
 * Drive's New is: a part, an assembly, a board, a harness or a document (`NewDialog`), written for
 * the agent into this chat, which comes into view to show the work start. It also opens when asked
 * from elsewhere (`useNewDialogStore`: the Document menu's From a template).
 */
export function StudioNew(props: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
  readonly threadRef: ScopedThreadRef;
  readonly composerRef: ComposerHandleRef;
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
          composerRef={props.composerRef}
          onCreated={() => useRightPanelStore.getState().setMaximized(props.threadRef, false)}
        />
      ) : null}
    </>
  );
}
