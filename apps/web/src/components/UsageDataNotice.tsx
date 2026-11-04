import { useAtomValue } from "@effect/atom-react";
import { useNavigate } from "@tanstack/react-router";
import * as Schema from "effect/Schema";
import { useEffect } from "react";

import { APP_BASE_NAME } from "../branding";
import { getLocalStorageItem, setLocalStorageItem } from "../hooks/useLocalStorage";
import { primaryServerConfigAtom } from "../state/server";
import { toastManager } from "./ui/toast";

const SEEN_KEY = "studio:usage-data-notice:v1";
// Keep an active toast across remounts, including Strict Mode effect replay.
let shown = false;

/**
 * Says once, in a build that sends usage counts, what it sends and where to turn it off
 * (Settings → About). Builds without a usage key never show it.
 */
export function UsageDataNotice() {
  const config = useAtomValue(primaryServerConfigAtom);
  const navigate = useNavigate();
  const sending =
    config !== null && config.observability.usageDataAvailable && config.settings.shareUsageData;
  useEffect(() => {
    if (!sending || shown) return;
    try {
      if (getLocalStorageItem(SEEN_KEY, Schema.Boolean)) return;
    } catch {
      // An unavailable store must not prevent the notice.
    }
    shown = true;
    const persistDismissal = () => {
      try {
        setLocalStorageItem(SEEN_KEY, true, Schema.Boolean);
      } catch {
        // The in-memory marker still prevents repeats during this launch.
      }
    };
    const dismiss = () => {
      persistDismissal();
      toastManager.close(id);
    };
    const id = toastManager.add({
      title: `${APP_BASE_NAME} sends anonymous usage counts`,
      description:
        "Which features get used and how often, to see what works. Never your prompts, file names or designs.",
      timeout: 0,
      onClose: persistDismissal,
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
  }, [navigate, sending]);
  return null;
}
