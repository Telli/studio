/**
 * Whether the host lays out a part script's model itself. Studio's bar switches Simple view for
 * every view and sends the layout in its host context (`studio/editLayout`); the app that hosts the
 * viewer takes that layout, and its navbar shows no switch of its own (`step/StepSurface.jsx`). One
 * per page, as a page is one view.
 *
 * The host's switch shows and holds as the navbar's would, so the part on screen reports what the
 * navbar's switch hangs on (`editState`): whether its file has a part script, the two layouts
 * (`editable`), and whether a command, sketch or pick is open or a change is being saved, which
 * holds the layout until it is finished or cancelled (`busy`). No part on screen, nothing of either.
 *
 * The part on screen asks the other way too (`request`): a double-click on a face laid out for the AI
 * asks for the CAD layout, one on empty space in CAD for the AI's (`step/edit/editLayout.js`'s
 * `doubleClickLayout`). The app that hosts the viewer says how to ask its host (`setRequester`) where
 * the host takes the ask (Studio's `studio/request/edit-layout`); the layout then comes back in the
 * host context as ever.
 */
export interface EditState {
  readonly editable: boolean;
  readonly busy: boolean;
}

export type EditLayout = 'manual' | 'ai';

const NONE: EditState = Object.freeze({ editable: false, busy: false });

let hosted = false;
const listeners = new Set<() => void>();
let editState: EditState = NONE;
const editListeners = new Set<() => void>();
let requester: ((layout: EditLayout) => void) | null = null;

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
  /** How to ask the host for a layout, while it takes the ask; the returned function takes it back. */
  setRequester(next: (layout: EditLayout) => void): () => void {
    requester = next;
    return () => {
      if (requester === next) requester = null;
    };
  },
  /** Asks the host for a layout: true when a host that takes the ask was asked, false where none does. */
  request(layout: EditLayout): boolean {
    if (requester === null) return false;
    requester(layout);
    return true;
  },
};
