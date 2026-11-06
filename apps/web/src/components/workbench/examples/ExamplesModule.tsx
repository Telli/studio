import type { StudioSample } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";

import { LibraryShelf, type Shelf } from "../library/LibraryShelf";
import { ExampleCard } from "./ExampleCard";

/**
 * The Toolbox page's first shelf: the finished projects Studio ships, each a cover with its name
 * and what it shows (`ExampleCard`), opening its page (`ExampleDetail`, `/library/examples/$id`),
 * where Make a copy to edit makes one of your own. The page's search box narrows it
 * (`findExamples`). It shows nothing where no example ships (the web app).
 */
export function ExamplesModule(props: {
  readonly shelf: Shelf;
  readonly examples: ReadonlyArray<StudioSample>;
}) {
  const navigate = useNavigate();
  if (props.examples.length === 0) return null;
  return (
    <LibraryShelf
      shelf={props.shelf}
      note="Finished projects Studio ships with, view only. Open one to see what it shows, then make a copy to edit."
    >
      {props.examples.map((sample) => (
        <ExampleCard
          key={sample.id}
          sample={sample}
          onOpen={() => void navigate({ to: "/library/examples/$id", params: { id: sample.id } })}
        />
      ))}
    </LibraryShelf>
  );
}
