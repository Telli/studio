import { create } from "zustand";

import type { ImportFile } from "./importPlan";

/**
 * Where Import starts (`ImportDialog.tsx`): a scan of this computer's folders, files or folders
 * dropped or picked, or the new files a notice found (`useNewFiles.ts`).
 */
export type ImportStart =
  | { readonly kind: "scan" }
  | { readonly kind: "paths"; readonly paths: ReadonlyArray<string> }
  | { readonly kind: "files"; readonly files: ReadonlyArray<ImportFile> };

export const useImportDialogStore = create<{
  readonly start: ImportStart | null;
  /** A fresh dialog for each start. */
  readonly count: number;
  readonly show: (start: ImportStart) => void;
  readonly close: () => void;
}>()((set) => ({
  start: null,
  count: 0,
  show: (start) => set((current) => ({ start, count: current.count + 1 })),
  close: () => set({ start: null }),
}));

/** Whether Restore a backup is open: Import's menu shows it, beside Import's own dialog. */
export const useRestoreDialogStore = create<{
  readonly open: boolean;
  readonly show: () => void;
  readonly close: () => void;
}>()((set) => ({
  open: false,
  show: () => set({ open: true }),
  close: () => set({ open: false }),
}));
