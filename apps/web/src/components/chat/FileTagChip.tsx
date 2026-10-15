import type { EnvironmentId } from "@t3tools/contracts";
import { ContextChipLabel } from "../ContextChip";
import { WorkspaceEntryIcon } from "./WorkspaceEntryIcon";
import { useFileChipLabel } from "../workbench/studioInterface";

/** Icon and label for a file mention; render inside `<ContextChip kind="mention">`. */
export function FileTagChipContent(props: {
  path: string;
  label: string;
  theme: "light" | "dark";
  environmentId?: EnvironmentId | null | undefined;
  cwd?: string | undefined;
}) {
  const label = useFileChipLabel(props.path, props.label);
  return (
    <>
      <WorkspaceEntryIcon
        path={props.path}
        environmentId={props.environmentId}
        cwd={props.cwd}
        theme={props.theme}
      />
      <ContextChipLabel>{label}</ContextChipLabel>
    </>
  );
}
