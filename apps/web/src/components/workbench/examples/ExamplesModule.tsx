import type { StudioSample } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { cn } from "~/lib/utils";
import { CARD_GRID, OverviewModule } from "../OverviewModules";
import { EXAMPLES_ICON } from "../kinds";
import { ExampleCard } from "./ExampleCard";

/** Where the Library's Examples section sits on the page. */
const EXAMPLES_ANCHOR = "library-examples";

/**
 * The Library's Examples section, first on the page: the finished projects Studio ships, each a
 * card with its picture, its name and what it shows (`ExampleCard`), opening its page
 * (`ExampleDetail`, `/library/examples/$id`), where Make a copy to edit makes one of your own.
 * The Library's search box narrows it (`findExamples`). It folds away as the
 * Library's other sections do, and shows nothing where no example ships (the web app).
 */
export function ExamplesModule(props: { readonly examples: ReadonlyArray<StudioSample> }) {
  const navigate = useNavigate();
  const [folded, setFolded] = useState(false);
  const matching = props.examples;
  if (matching.length === 0) return null;
  return (
    <div id={EXAMPLES_ANCHOR} className="scroll-mt-6">
      <OverviewModule
        title="Examples"
        icon={EXAMPLES_ICON}
        count={matching.length}
        folded={folded}
        onFold={() => setFolded((value) => !value)}
      >
        <p className="pt-1 text-sm text-muted-foreground">
          Finished projects Studio ships with, view only. Open one to see what it shows, then make a
          copy to edit.
        </p>
        <div className={cn(CARD_GRID, "pt-3")}>
          {matching.map((sample) => (
            <ExampleCard
              key={sample.id}
              sample={sample}
              onOpen={() =>
                void navigate({ to: "/library/examples/$id", params: { id: sample.id } })
              }
            />
          ))}
        </div>
      </OverviewModule>
    </div>
  );
}
