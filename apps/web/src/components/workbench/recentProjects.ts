/** What a project tile says under its name (`ProjectTile.tsx`), and whether it is new. */

const DAY_MS = 24 * 60 * 60 * 1000;

export function projectActivity(input: {
  readonly createdAt: string;
  readonly threads: ReadonlyArray<{ readonly title: string; readonly updatedAt: string }>;
  readonly now: number;
  readonly relative: (iso: string) => string;
}): { readonly line: string; readonly isNew: boolean } {
  const isNew = input.now - Date.parse(input.createdAt) < DAY_MS && input.threads.length <= 1;
  const latest = input.threads.reduce<(typeof input.threads)[number] | null>(
    (newest, thread) => (newest === null || thread.updatedAt > newest.updatedAt ? thread : newest),
    null,
  );
  if (latest === null) return { line: `Made ${input.relative(input.createdAt)}`, isNew };
  const title = latest.title.trim();
  const when = input.relative(latest.updatedAt);
  return { line: title === "" ? `Worked on ${when}` : `${title}, ${when}`, isNew };
}

/** Projects whose name, purpose or a chat's title holds the search, in their order. */
export function findProjects<
  T extends {
    readonly project: { readonly name: string; readonly brief: { readonly purpose: string } };
    readonly threads: ReadonlyArray<{ readonly title: string }>;
  },
>(cards: ReadonlyArray<T>, query: string): T[] {
  const wanted = query.trim().toLowerCase();
  if (wanted === "") return [...cards];
  return cards.filter(
    ({ project, threads }) =>
      project.name.toLowerCase().includes(wanted) ||
      project.brief.purpose.toLowerCase().includes(wanted) ||
      threads.some((thread) => thread.title.toLowerCase().includes(wanted)),
  );
}
