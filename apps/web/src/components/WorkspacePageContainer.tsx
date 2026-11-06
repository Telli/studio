import type { ComponentPropsWithoutRef } from "react";

import { cn } from "../lib/utils";

export type WorkspacePageWidth = "wide" | "expanded";

const WIDTH_CLASS: Record<WorkspacePageWidth, string> = {
  wide: "max-w-5xl",
  expanded: "max-w-6xl",
};

/** The one content frame for workspace pages: left edge, max width, title position, section gap. */
export function WorkspacePageContainer({
  width = "wide",
  className,
  ...props
}: ComponentPropsWithoutRef<"div"> & { readonly width?: WorkspacePageWidth }) {
  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 px-5 pt-6 pb-12 sm:px-6",
        WIDTH_CLASS[width],
        className,
      )}
      {...props}
    />
  );
}
