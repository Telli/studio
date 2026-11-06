/**
 * What a folder's own git settings may not do. A project can arrive from anyone (Import keeps a
 * supplier's `.git`), and its `.git/config` can name programs for git to run: an fsmonitor, hooks, a
 * pager, a clean or smudge filter. Studio's own git steps, checkpoints and project saves, run with
 * those turned off, so such a folder stays just files. A person's own git commands in the code
 * interfaces keep their hooks, and the filters of a person's own settings (git-lfs) always stand.
 */

/**
 * Settings for one git call. On Windows git reads `/dev/null` as a folder at the top of the drive,
 * which holds no hooks; the empty pager means none on either system.
 */
export const FOLDER_SAFE_GIT_ARGS = [
  "-c",
  "core.fsmonitor=false",
  "-c",
  "core.hooksPath=/dev/null",
  "-c",
  "core.pager=",
] as const;

/** The git call that lists the filter settings there are; reading them runs nothing. */
export const FOLDER_FILTERS_ARGS = [
  "config",
  "--show-scope",
  "--name-only",
  "-z",
  "--get-regexp",
  "^filter\\.",
] as const;

/**
 * The environment that blanks the filters a folder's own config names, from what
 * `FOLDER_FILTERS_ARGS` printed. Filters have any name, so each is blanked by its own; through the
 * environment, as a name can hold the `=` that would end a `-c` key.
 */
export function blankedFiltersEnv(listing: string): Record<string, string> {
  const fields = listing.split("\0");
  const names = new Set<string>();
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const scope = fields[index];
    if (scope !== "local" && scope !== "worktree") continue;
    const name = /^filter\.(.+)\.[^.]+$/s.exec(fields[index + 1] ?? "")?.[1];
    if (name !== undefined) names.add(name);
  }
  const blanks = [...names].flatMap((name) => [
    [`filter.${name}.clean`, ""],
    [`filter.${name}.smudge`, ""],
    [`filter.${name}.process`, ""],
    [`filter.${name}.required`, "false"],
  ]);
  if (blanks.length === 0) return {};
  const env: Record<string, string> = { GIT_CONFIG_COUNT: String(blanks.length) };
  blanks.forEach(([key, value], index) => {
    env[`GIT_CONFIG_KEY_${index}`] = key!;
    env[`GIT_CONFIG_VALUE_${index}`] = value!;
  });
  return env;
}
