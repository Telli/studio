import { useNavigate } from "@tanstack/react-router";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { ChatPage } from "../ChatPages";
import { useExamples } from "../library/useSampleProject";
import { CARD_GRID } from "../OverviewModules";
import { ExampleCard } from "./ExampleCard";

/**
 * Studio's Examples (`/examples`, on the rail after Projects): the finished projects Studio ships,
 * each a card with its picture, its name and what it shows (`ExampleCard`), opening its page
 * (`ExampleDetail`), where Make a copy to edit makes one of your own.
 */
export function ExamplesPage() {
  const environmentId = usePrimaryEnvironmentId();
  const navigate = useNavigate();
  const { examples, loaded } = useExamples(environmentId);
  return (
    <ChatPage
      title="Examples"
      count={examples.length}
      lede="Finished projects Studio ships with, view only. Open one to see what it shows, then make a copy to edit."
    >
      {!loaded ? null : examples.length === 0 ? (
        <p className="py-6 text-sm text-muted-foreground">
          No examples ship with this Studio. The desktop app has them.
        </p>
      ) : (
        <div className="@container min-w-0">
          <div className={CARD_GRID}>
            {examples.map((sample) => (
              <ExampleCard
                key={sample.id}
                sample={sample}
                onOpen={() => void navigate({ to: "/examples/$id", params: { id: sample.id } })}
              />
            ))}
          </div>
        </div>
      )}
    </ChatPage>
  );
}
