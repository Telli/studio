import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { create } from "zustand";

import { sameFile } from "../sameFile";

/**
 * The place a reference asks a part's CAD view to show (`openReference`): the line of the part's
 * script the answer cites, for the view to select the feature whose statement holds it. The view
 * hears it in its host context (`studio/focus`, `PluginViewFrame.tsx`) and says when it has taken
 * it (`studio/notifications/focus-taken`), the feature selected or nothing there to select, and the
 * ask is let go. Each press is numbered (`nonce`), so a view takes each ask once and an answer to
 * an earlier press never lets a later one go.
 */
export interface ViewerFocus {
  readonly path: string;
  readonly line: number;
  readonly nonce: number;
}

/** Each chat's asks, by the STEP of the part each is for. */
type ByThread = Readonly<Record<string, Readonly<Record<string, ViewerFocus>>>>;

let pressed = 0;

export const useViewerFocusStore = create<{
  readonly byThread: ByThread;
  /** Asks the view of `step` beside the chat to show `at`, in place of any ask for it before. */
  readonly focus: (threadKey: string, step: string, at: { path: string; line: number }) => void;
  /** The view of `step` has taken the ask numbered `nonce`; an ask made since stands. */
  readonly take: (threadKey: string, step: string, nonce: number) => void;
}>()((setState, get) => ({
  byThread: {},
  focus: (threadKey, step, { path, line }) => {
    pressed += 1;
    const { byThread } = get();
    const others = Object.entries(byThread[threadKey] ?? {}).filter(
      ([kept]) => !sameFile(kept, step),
    );
    setState({
      byThread: {
        ...byThread,
        [threadKey]: { ...Object.fromEntries(others), [step]: { path, line, nonce: pressed } },
      },
    });
  },
  take: (threadKey, step, nonce) => {
    const { byThread } = get();
    const asks = Object.entries(byThread[threadKey] ?? {});
    const kept = asks.filter(([part, ask]) => !(sameFile(part, step) && ask.nonce === nonce));
    if (kept.length === asks.length) return;
    const { [threadKey]: _taken, ...rest } = byThread;
    setState({
      byThread: kept.length === 0 ? rest : { ...rest, [threadKey]: Object.fromEntries(kept) },
    });
  },
}));

/** The ask for a view of `file` beside the chat, however either names the file; null for none. */
export function viewerFocusOf(
  state: { readonly byThread: ByThread },
  threadKey: string,
  file: string,
): ViewerFocus | null {
  const asks = Object.entries(state.byThread[threadKey] ?? {});
  return asks.find(([step]) => sameFile(step, file))?.[1] ?? null;
}

/** A plugin view, as its frame is given it (`PluginViewTarget`). */
interface ViewTarget {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId | null;
  readonly file?: string | undefined;
  readonly arguments: Record<string, unknown>;
}

/**
 * Where a view's asks are kept: its chat, and the file it shows, as its tab opened it or, for the
 * view the agent opened (`agentViewSurface`), as the agent's call named it. Null for a view beside
 * no chat or of no file, which is asked nothing.
 */
export function viewerFocusPlace(
  target: ViewTarget,
): { readonly threadKey: string; readonly file: string } | null {
  const named = target.arguments.path;
  const file = target.file ?? (typeof named === "string" && named !== "" ? named : undefined);
  if (target.threadId === null || file === undefined) return null;
  return {
    threadKey: scopedThreadKey(scopeThreadRef(target.environmentId, target.threadId)),
    file,
  };
}

/** What a view is asked to show now (`studio/focus`), or null. */
export function useViewerFocus(target: ViewTarget): ViewerFocus | null {
  const place = viewerFocusPlace(target);
  return useViewerFocusStore((state) =>
    place === null ? null : viewerFocusOf(state, place.threadKey, place.file),
  );
}

/** The view has taken the ask numbered `nonce` (`studio/notifications/focus-taken`). */
export function takeViewerFocus(target: ViewTarget, nonce: number): void {
  const place = viewerFocusPlace(target);
  if (place !== null) useViewerFocusStore.getState().take(place.threadKey, place.file, nonce);
}
