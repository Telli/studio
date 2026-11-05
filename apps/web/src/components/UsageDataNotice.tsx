import { useAtomValue } from "@effect/atom-react";
import { useEffect } from "react";

import { APP_BASE_NAME } from "../branding";
import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";
import { primaryServerConfigAtom, serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import { toastManager } from "./ui/toast";

// Keep an active toast across remounts, including Strict Mode effect replay.
let shown = false;

/**
 * Asks once, in a build that sends usage counts, before any are sent: what it sends, and where to
 * turn it off later (Settings → About). Share lets the server send; Don't share says no. Closing it
 * answers nothing, so it asks again next launch, as Backplane's popup does. Builds without a usage
 * receiver never ask.
 */
export function UsageDataNotice() {
  const config = useAtomValue(primaryServerConfigAtom);
  const environmentId = useAtomValue(primaryEnvironmentIdAtom);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "note the usage data notice",
  });
  const asking =
    config !== null &&
    environmentId !== null &&
    config.observability.usageDataAvailable &&
    config.settings.shareUsageData &&
    !config.settings.usageDataAnswered;
  useEffect(() => {
    if (!asking || shown || environmentId === null) return;
    shown = true;
    const answer = (share: boolean) => {
      toastManager.close(id);
      void updateSettings({
        environmentId,
        input: { patch: { usageDataAnswered: true, shareUsageData: share } },
      });
    };
    const id = toastManager.add({
      title: `Share anonymous usage counts with ${APP_BASE_NAME}?`,
      description:
        "Which features get used and how often, to see what works. Never your prompts, file names or designs. Nothing is sent until you choose Share, and Settings → About turns it off and deletes what was sent.",
      timeout: 0,
      actionProps: { children: "Share", onClick: () => answer(true) },
      data: {
        actionLayout: "stacked-end",
        secondaryActionProps: { children: "Don't share", onClick: () => answer(false) },
        secondaryActionVariant: "ghost",
      },
    });
  }, [asking, environmentId, updateSettings]);
  return null;
}
