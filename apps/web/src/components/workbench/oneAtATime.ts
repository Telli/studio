/**
 * Runs `work` for `key` unless one is under way for it already, which is handed back instead: a
 * second press while a part or a project is being made does nothing more. Once it settles the key
 * is free again.
 */
export function oneAtATime<T>(
  underWay: Map<string, Promise<T>>,
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const running = underWay.get(key);
  if (running !== undefined) return running;
  const next = Promise.resolve()
    .then(work)
    .finally(() => {
      if (underWay.get(key) === next) underWay.delete(key);
    });
  underWay.set(key, next);
  return next;
}
