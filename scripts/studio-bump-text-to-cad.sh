#!/usr/bin/env bash
# Offers Jake's latest text-to-cad release to Studio, and only offers it: nothing here touches
# `studio-base`, Studio's `main` or a release (STUDIO.md, Releasing).
#
# When his release is newer than the pin, this merges its tag into a copy of `studio-base`
# (`bump/<version>` on the fork, never rebased, so old pins stay fetchable), runs his Test workflow
# once on each head, and keeps one draft review on Studio (`bump/text-to-cad`) moving the pin. A
# later run merges in what moved and refreshes the result. A conflict opens the review listing its
# files and stops: resolve it on `bump/<version>` and the next run carries on from there.
#
#     STUDIO_BUMP_TOKEN=<token> scripts/studio-bump-text-to-cad.sh
#
# The token is a fine-grained one on the fork and Studio (STUDIO.md lists its permissions), since
# the default token's reviews start no CI. With none this says so and stops, successfully.
set -euo pipefail

UPSTREAM_REPO="${UPSTREAM_REPO:-earthtojake/text-to-cad}"
FORK_REPO="${FORK_REPO:-amywork777/text-to-cad-upstream}"
STUDIO_REPO="${STUDIO_REPO:-amywork777/studio}"
GIT_HOST="${GIT_HOST:-https://github.com}"
BASE=studio-base
REVIEW=bump/text-to-cad

if [ -z "${STUDIO_BUMP_TOKEN:-}" ]; then
  echo "::notice::STUDIO_BUMP_TOKEN is not set, so no text-to-cad bump was offered (STUDIO.md, Releasing)."
  exit 0
fi
export GH_TOKEN="$STUDIO_BUMP_TOKEN" GIT_TERMINAL_PROMPT=0
# Reaches every git this starts, the on-demand blob fetches of the partial clones included.
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="http.$GIT_HOST/.extraheader"
GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GH_TOKEN" | base64 | tr -d '\n')"
export GIT_CONFIG_VALUE_0
export GIT_AUTHOR_NAME="github-actions[bot]" GIT_AUTHOR_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

work="$(mktemp -d "${TMPDIR:-/tmp}/studio-bump.XXXXXX")"
trap 'rm -rf "$work"' EXIT

# Both clones stay without a working tree: `merge-tree` needs none, and Studio's vendored `.repos`
# gitlinks never get a chance to fail a checkout.
git clone --quiet --bare --filter=blob:none "$GIT_HOST/$FORK_REPO.git" "$work/fork"
git clone --quiet --bare --filter=blob:none "$GIT_HOST/$STUDIO_REPO.git" "$work/studio"
fork() { git -C "$work/fork" "$@"; }
studio() { git -C "$work/studio" "$@"; }

# Every run proves the token can write to both, not only the day a release needs it. A dry run
# changes nothing, but GitHub still refuses it without write access. Pull requests stay unproven.
denied=0
for copy in fork studio; do
  if git -C "$work/$copy" push --dry-run --quiet origin HEAD:refs/heads/bump/access-check; then
    echo "The token can write to the $copy repository."
  else
    echo "::error::STUDIO_BUMP_TOKEN cannot write to the $copy repository (STUDIO.md, Releasing)."
    denied=1
  fi
done
[ "$denied" -eq 0 ] || exit 1

tag="$(gh api "repos/$UPSTREAM_REPO/releases/latest" --jq .tag_name)"
version="${tag#v}"
pin="$(studio rev-parse main:text-to-cad)"
pinned="$(fork show "$pin:VERSION" | tr -d '[:space:]')"
newest="$(printf '%s\n%s\n' "$version" "$pinned" | sort -V | tail -1)"
if [ "$version" = "$pinned" ] || [ "$newest" = "$pinned" ]; then
  echo "::notice::Studio has text-to-cad $pinned, and Jake's latest release is $version."
  exit 0
fi
echo "Jake's $version is newer than the pin's $pinned."

fork remote add upstream "$GIT_HOST/$UPSTREAM_REPO.git"
# Whole, not filtered: a merge's blobs must all come from the fork's promisor, which lacks Jake's new ones.
fork fetch --quiet --no-tags upstream "refs/tags/$tag:refs/tags/$tag"
tag_commit="$(fork rev-parse "refs/tags/$tag^{commit}")"
base_commit="$(fork rev-parse "refs/heads/$BASE")"
branch="bump/$version"

# Sets `merged` to `$1` with `$2` merged in, or lists the files in `conflicts` and returns 1. The
# result is left unset by a conflict, so a commit never carries conflict markers.
conflicts=""
merge_on_fork() {
  local ours="$1" theirs="$2" message="$3" output status=0
  if fork merge-base --is-ancestor "$theirs" "$ours"; then
    merged="$ours"
    return 0
  fi
  output="$(fork merge-tree --write-tree --name-only --no-messages "$ours" "$theirs")" || status=$?
  if [ "$status" -eq 1 ]; then
    conflicts="$(printf '%s\n' "$output" | tail -n +2 | sed '/^$/d' | sort -u)"
    return 1
  fi
  [ "$status" -eq 0 ] || exit "$status"
  merged="$(fork commit-tree "$output" -p "$ours" -p "$theirs" -m "$message")" || exit 1
}

head="$base_commit"
remote_head=""
if fork rev-parse --verify --quiet "refs/heads/$branch" >/dev/null; then
  remote_head="$(fork rev-parse "refs/heads/$branch")"
  head="$remote_head"
fi
merged=""
if merge_on_fork "$head" "$base_commit" "Merge $BASE into $branch" &&
  merge_on_fork "$merged" "$tag_commit" "Merge text-to-cad $tag into $BASE"; then
  head="$merged"
  if [ "$head" != "$remote_head" ]; then
    fork push --quiet origin "$head:refs/heads/$branch"
  fi
fi

# The workflow's run on this exact commit: started once, and said in one line. A run this cannot
# start, as on a fork with Actions off, is reported in the review, never as a passed test.
run_once() {
  local repo="$1" workflow="$2" ref="$3" commit="$4"
  shift 4
  local run short="${commit:0:12}"
  run="$(gh run list --repo "$repo" --workflow "$workflow" --branch "$ref" --limit 50 --json headSha,status,conclusion,url \
    --jq "[.[] | select(.headSha == \"$commit\")][0] // empty | (if .status == \"completed\" then .conclusion else \"running\" end) + \" on $short: \" + .url")" || run=""
  if [ -n "$run" ]; then
    echo "$run"
  elif gh workflow run "$workflow" --repo "$repo" --ref "$ref" "$@" >/dev/null; then
    echo "started on $short; the next run reads its result."
  else
    echo "could not start on $short."
  fi
}

# The commit the review's branch should be at: main merged in, so its checks test what would land,
# and the pin at `$1`. This sets the pin itself, so a conflict on the pin alone stops nothing.
moved_pin_commit() {
  local target="$1" message="$2" parents=(main) tip="" tree output status=0 others
  tree="$(studio rev-parse 'main^{tree}')"
  if studio rev-parse --verify --quiet "refs/heads/$REVIEW" >/dev/null; then
    tip="$(studio rev-parse "refs/heads/$REVIEW")"
    parents=("$tip" main)
    if studio merge-base --is-ancestor main "$tip"; then
      parents=("$tip")
      tree="$(studio rev-parse "$tip^{tree}")"
    else
      output="$(studio merge-tree --write-tree --name-only --no-messages "$tip" main)" || status=$?
      [ "$status" -le 1 ] || exit "$status"
      others="$(printf '%s\n' "$output" | tail -n +2 | sed '/^$/d' | grep -vx 'text-to-cad' || true)"
      if [ -n "$others" ]; then
        echo "::error::$REVIEW and main conflict in: $others" >&2
        exit 1
      fi
      tree="$(printf '%s\n' "$output" | head -1)"
    fi
  fi
  local index="$work/index"
  GIT_INDEX_FILE="$index" studio read-tree "$tree"
  GIT_INDEX_FILE="$index" studio update-index --add --cacheinfo "160000,$target,text-to-cad"
  local new_tree parent_flags=()
  new_tree="$(GIT_INDEX_FILE="$index" studio write-tree)"
  if [ "${#parents[@]}" -eq 1 ] && [ -n "$tip" ] && [ "$new_tree" = "$tree" ]; then
    printf '%s' "$tip"
    return
  fi
  for parent in "${parents[@]}"; do parent_flags+=(-p "$(studio rev-parse "$parent")"); done
  studio commit-tree "$new_tree" "${parent_flags[@]}" -m "$message"
}

notes="$work/review.md"
if [ -n "$conflicts" ]; then
  review_title="Move text-to-cad to $version (conflicts to resolve)"
  commit="$(moved_pin_commit "$pin" "text-to-cad $version needs its conflicts resolved")"
  {
    printf 'Merging text-to-cad %s into `%s` conflicts, so the pin has not moved.\n\n' "$tag" "$BASE"
    printf '%s\n' "$conflicts" | sed 's/.*/- `&`/'
    printf '\nResolve them on `%s` on the fork, starting from `%s` if it is not there yet. The next run picks it up from there.\n' "$branch" "$BASE"
  } >"$notes"
else
  review_title="Move text-to-cad to $version"
  commit="$(moved_pin_commit "$head" "Move text-to-cad to $version")"
  jake_test="$(run_once "$FORK_REPO" test.yml "$branch" "$head")"
  migrations="$(fork diff --name-only --diff-filter=A "$pin" "$head" -- docs/migrations/ | sed 's/.*/- `&`/')"
  {
    printf 'text-to-cad %s, on `%s` of the fork: %s\n\n' "$tag" "$branch" "${head:0:12}"
    printf '**Jake'"'"'s Test workflow:** %s\n\n' "$jake_test"
    printf '**New migration guides:**\n\n%s\n\n' "${migrations:-None.}"
    printf '## Jake'"'"'s notes\n\n'
    gh api "repos/$UPSTREAM_REPO/releases/latest" --jq .body
  } >"$notes"
fi

if [ "$(studio rev-parse --verify --quiet "refs/heads/$REVIEW" || true)" != "$commit" ]; then
  studio push --quiet origin "$commit:refs/heads/$REVIEW"
fi
if [ -z "$conflicts" ]; then
  # A real app on the review's pin: built, installed and checked on Windows, as a release is. The
  # version only names the build's files, and nothing of this run is kept past its artifact.
  windows="$(run_once "$STUDIO_REPO" studio-windows.yml "$REVIEW" "$commit" -f "version=0.0.0")"
  printf '\n**Studio on Windows:** %s\n' "$windows" >>"$notes"
fi

number="$(gh pr list --repo "$STUDIO_REPO" --head "$REVIEW" --state open --json number --jq '.[0].number // empty')"
if [ -n "$number" ]; then
  gh pr edit "$number" --repo "$STUDIO_REPO" --title "$review_title" --body-file "$notes"
else
  gh pr create --draft --repo "$STUDIO_REPO" --base main --head "$REVIEW" --title "$review_title" --body-file "$notes"
fi
echo "::notice::$review_title"
