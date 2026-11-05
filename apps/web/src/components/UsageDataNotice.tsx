import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { APP_BASE_NAME } from "../branding";
import { primaryEnvironmentIdAtom } from "../state/primaryEnvironment";
import { primaryServerConfigAtom, serverEnvironment } from "../state/server";
import { useAtomCommand } from "../state/use-atom-command";
import { toastManager } from "./ui/toast";

// Keep an active toast across remounts, including Strict Mode effect replay.
let shown = false;

/**
 * Says once, in a build that sends usage counts, what it sends and where to turn it off
 * (Settings → About). Builds without a usage receiver never show it. Showing it is what lets the
 * server send (`usageDataNoticeShown`): nothing counted before it goes anywhere.
 */
export function UsageDataNotice() {
  const config = useAtomValue(primaryServerConfigAtom);
  const environmentId = useAtomValue(primaryEnvironmentIdAtom);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "note the usage data notice",
  });
  const navigate = useNavigate();
  const telling =
    config !== null &&
    environmentId !== null &&
    config.observability.usageDataAvailable &&
    config.settings.shareUsageData &&
    !config.settings.usageDataNoticeShown;
  useEffect(() => {
    if (!telling || shown || environmentId === null) return;
    shown = true;
    void updateSettings({ environmentId, input: { patch: { usageDataNoticeShown: true } } });
    const dismiss = () => toastManager.close(id);
    const id = toastManager.add({
      title: `${APP_BASE_NAME} sends anonymous usage counts`,
      description:
        "Which features get used and how often, to see what works. Never your prompts, file names or designs. Turning it off deletes what was sent.",
      timeout: 0,
      actionProps: {
        children: "Turn off",
        onClick: () => {
          dismiss();
          void navigate({ to: "/settings/general", hash: "usage-data" });
        },
      },
      data: {
        actionLayout: "stacked-end",
        secondaryActionProps: { children: "OK", onClick: dismiss },
        secondaryActionVariant: "ghost",
      },
    });
  }, [environmentId, navigate, telling, updateSettings]);
  return null;
}
