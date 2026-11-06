import { DEFAULT_UNIFIED_SETTINGS } from "@t3tools/contracts/settings";

/**
 * What Restore defaults does to the usage question. The default is on, so a person's no is asked
 * again, with nothing sent until they answer, and never quietly becomes a yes. A yes stands.
 */
export function usageDataRestorePatch(settings: { readonly shareUsageData: boolean }) {
  return settings.shareUsageData === DEFAULT_UNIFIED_SETTINGS.shareUsageData
    ? {}
    : { shareUsageData: DEFAULT_UNIFIED_SETTINGS.shareUsageData, usageDataAnswered: false };
}
