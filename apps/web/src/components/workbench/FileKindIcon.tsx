import { isDocumentId } from "@t3tools/client-runtime/state/pluginFollow";

import { cn } from "~/lib/utils";
import { FILE_ICONS, fileIconKey, fileTint } from "./kinds";
import { partName } from "./partNames";

/**
 * A file's kind as a small colored mark, as a browser tab shows a site's icon (`fileTint`). The
 * panel's tabs wear it in the engineering interface (`RightPanelTabs`).
 */
export function FileKindIcon(props: { readonly path: string; readonly className?: string }) {
  // A cadgen model opens by its document id, which ends in nothing: it is a part all the same.
  const key = fileIconKey(
    partName(props.path)?.kind ?? (isDocumentId(props.path) ? "Part" : "Document"),
  );
  const Icon = FILE_ICONS[key];
  return <Icon aria-hidden="true" className={cn("shrink-0", fileTint(key), props.className)} />;
}
