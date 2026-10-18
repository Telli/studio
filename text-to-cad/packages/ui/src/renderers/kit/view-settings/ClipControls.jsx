import { normalizeStepClipSettings } from "@text-to-cad/core/lib/viewer/clipPlane.js";
import { ClipFlipButton, CrossSectionControls } from "../tools/model-effects/ModelViewControls.js";

export { clipSummary } from "../tools/model-effects/ModelViewControls.js";

// The Clip panel's body, for a view whose Clip is a panel of the stack rather than a sub-toolbar
// row (an FEA result's): the axis, the slider and Flip, each the sub-toolbar's own
// (`tools/model-effects/ModelViewControls.js`). The view settings own the effect; what a cut does
// to a scene is its renderer's.

/** The settings that leave no cut: what a fresh panel starts at and what its X puts back. */
export const NEUTRAL_CLIP = Object.freeze({ enabled: false, axis: "x", invert: false });

/** Whether the view cuts the model. */
export function clipApplied(viewSettings) {
  return normalizeStepClipSettings(viewSettings?.clip).enabled;
}

/**
 * The Clip panel's body: its axis, then one slider, then Flip. `bounds` is the box it cuts through,
 * which the slider's share is measured on (disabled while it has no extent).
 */
export function ClipControls({ viewSettings, onViewSettingsPatch, bounds }) {
  return <div className="flex min-w-0 items-center gap-2 px-2 py-1">
    <CrossSectionControls viewSettings={viewSettings} onViewSettingsPatch={onViewSettingsPatch} bounds={bounds}
      className="flex min-w-0 flex-1 items-center gap-2" />
    <ClipFlipButton viewSettings={viewSettings} onViewSettingsPatch={onViewSettingsPatch} bounds={bounds} />
  </div>;
}

/** Clip's strip icon: a cut sphere. */
export function ClipIcon(props) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M16 4.5a8.5 8.5 0 1 0 0 15" />
    <ellipse cx="16" cy="12" rx="3" ry="7.5" />
  </svg>;
}
