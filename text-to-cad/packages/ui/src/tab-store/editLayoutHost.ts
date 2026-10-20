/**
 * Whether the host lays out a part script's model itself. Studio's top bar switches Ask and Edit
 * by hand for a whole workspace and sends it in its host context (`studio/editLayout`); the
 * viewer then takes that layout (`apps/mcp` `App.tsx`) and its navbar shows no switch of its own
 * (`step/StepSurface.jsx`). One per page, as a page is one view.
 */
let hosted = false;
const listeners = new Set<() => void>();

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
};
