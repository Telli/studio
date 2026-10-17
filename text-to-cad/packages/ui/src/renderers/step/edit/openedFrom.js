/**
 * Where Open Part came from: the assembly a part was opened from, so the part's design tree can
 * lead back to it. Kept for the session, by the part's file; a page that keeps nothing (a private
 * window) simply offers no way back.
 */
const KEY = "cad-edit-opened-from:";

/** Remembers that `part` (its file's absolute path) was opened from `from` ({ file, title }). */
export function rememberOpenedFrom(part, from) {
  try {
    sessionStorage.setItem(KEY + part, JSON.stringify(from));
  } catch {
    // Nothing kept: the part opens all the same.
  }
}

/** The assembly `file` was opened from, as `{ file, title }`, or null. */
export function openedFrom(file) {
  if (!file) return null;
  try {
    const kept = JSON.parse(sessionStorage.getItem(KEY + file) || "null");
    return kept && typeof kept.file === "string" && kept.file !== file ? kept : null;
  } catch {
    return null;
  }
}
