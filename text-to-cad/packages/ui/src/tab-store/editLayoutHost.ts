/**
 * Whether the host lays out a part script's model itself. Studio's bar switches Simple view for
 * every view and sends the layout in its host context (`studio/editLayout`); the viewer then takes
 * that layout (`apps/mcp` `App.tsx`) and its navbar shows no switch of its own
 * (`step/StepSurface.jsx`). One per page, as a page is one view.
 *
 * The host's switch shows and holds as the navbar's would, so the part on screen reports what the
 * navbar's switch hangs on (`editState`): whether its file has a part script, the two layouts
 * (`editable`), and whether a command, sketch or pick is open or a change is being saved, which
 * holds the layout until it is finished or cancelled (`busy`). No part on screen, nothing of either.
 */
export interface EditState {
  readonly editable: boolean;
  readonly busy: boolean;
}

const NONE: EditState = Object.freeze({ editable: false, busy: false });

let hosted = false;
const listeners = new Set<() => void>();
let editState: EditState = NONE;
const editListeners = new Set<() => void>();

export const editLayoutHost = {
  get: (): boolean => hosted,
  set(next: boolean): void {
    if (hosted === next) return;
    hosted = next;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** What the part on screen allows, as it last said. */
  editState: (): EditState => editState,
  /** The part on screen says what it allows; null as it leaves the screen. */
  reportEditState(next: EditState | null): void {
    const { editable, busy } = next ?? NONE;
    if (editState.editable === editable && editState.busy === busy) return;
    editState = Object.freeze({ editable, busy });
    for (const listener of editListeners) listener();
  },
  subscribeEditState(listener: () => void): () => void {
    editListeners.add(listener);
    return () => {
      editListeners.delete(listener);
    };
  },
};
