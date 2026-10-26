import { useState } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../../ui/button";
import { SAMPLE_NAME } from "./sampleProject";

/**
 * See the example, as New and the library both offer it: opens an entry's example in the sample
 * project (`useSampleProject`'s `open`). The first press copies the sample in as a project of its
 * own, so it says where the example opens.
 */
export function SeeTheExample(props: {
  /** The example's file in the sample project. */
  readonly file: string;
  readonly open: (file: string) => Promise<boolean>;
  readonly size: "xs" | "sm";
  /** Once the example is open. */
  readonly onOpened?: () => void;
  readonly className?: string;
}) {
  const [opening, setOpening] = useState(false);
  const see = () => {
    setOpening(true);
    void props
      .open(props.file)
      .then((opened) => {
        if (opened) props.onOpened?.();
      })
      .finally(() => setOpening(false));
  };
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", props.className)}>
      <Button variant="outline" size={props.size} disabled={opening} onClick={see}>
        See the example
      </Button>
      <span className="text-xs text-muted-foreground">Opens in {SAMPLE_NAME}</span>
    </div>
  );
}
