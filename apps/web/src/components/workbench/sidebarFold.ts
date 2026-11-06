const listeners = new Set<() => void>();

/**
 * A project just opened, or a part in CAD: it starts with the sidebar folded, for the model to have
 * its column, and the header's switcher moves between projects. Opening runs outside React
 * (`openPartInCad`), so this asks whoever holds the sidebar (`AppSidebarLayout`). The panel button
 * and the shortcut bring it back as ever.
 */
export function foldSidebarForPart() {
  for (const listener of listeners) listener();
}

/** Hears `foldSidebarForPart`. Returns the way to stop. */
export function onFoldSidebarForPart(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
