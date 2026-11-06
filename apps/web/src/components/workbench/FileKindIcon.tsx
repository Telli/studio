import { cn } from "~/lib/utils";
import { FILE_ICONS, fileIconKey, KIND_TINT } from "./kinds";
import { partName } from "./partNames";

/**
 * A file's kind as a small colored mark, as a browser tab shows a site's icon: a part's cube in
 * CAD's blue, a document's page in sky, a study's gauge in amber (`kinds.ts`). The panel's tabs
 * wear it in the engineering interface (`RightPanelTabs`).
 */
export function FileKindIcon(props: { readonly path: string; readonly className?: string }) {
  const key = fileIconKey(partName(props.path)?.kind ?? "Document");
  const Icon = FILE_ICONS[key];
  return <Icon aria-hidden="true" className={cn("shrink-0", KIND_TINT, props.className)} />;
}
