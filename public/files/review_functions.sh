# Helpers for reviewing AI-generated changes in a normal Git diff UI.
# Source this file from your ~/.bashrc.

_review_helper_git_dir() {
  git rev-parse --absolute-git-dir 2>/dev/null
}

_review_helper_state_file() {
  local git_dir="$(_review_helper_git_dir)" || return 1
  printf "%s/.review_original_branch" "$git_dir"
}

review_start() {
  local review_branch="${REVIEW_BRANCH_NAME:-${USER}/review_in_progress}"
  local commit_message="${1:-snapshot}"
  local git_dir="$(_review_helper_git_dir)"
  if [ -z "$git_dir" ]; then
    echo "review_start: not inside a git repository."
    return 1
  fi

  local state_file="$(_review_helper_state_file)" || return 1
  if [ -f "$state_file" ]; then
    echo "review_start: a review session is already in progress (state file $state_file)."
    echo "Run review_done or remove the state file if this is a mistake."
    return 1
  fi

  if git show-ref --quiet --verify "refs/heads/$review_branch"; then
    echo "review_start: branch '$review_branch' already exists. Delete it or set REVIEW_BRANCH_NAME."
    return 1
  fi

  local original_branch
  original_branch=$(git branch --show-current)
  if [ -z "$original_branch" ]; then
    echo "review_start: unable to determine current branch (detached HEAD?)."
    return 1
  fi

  local tracked_changes
  tracked_changes=$(git status --porcelain --untracked-files=no)
  if [ -z "$tracked_changes" ]; then
    echo "review_start: no tracked changes to commit. Stage edits first."
    return 1
  fi

  echo "review_start: committing tracked changes on '$original_branch'..."
  if ! git commit -am "$commit_message"; then
    echo "review_start: git commit failed."
    return 1
  fi

  if ! git switch -c "$review_branch"; then
    echo "review_start: failed to create review branch '$review_branch'."
    return 1
  fi

  if ! git reset --mixed -N HEAD~; then
    echo "review_start: git reset failed; aborting."
    return 1
  fi

  printf "%s\n" "$original_branch" > "$state_file"
  echo "review_start: review branch '$review_branch' ready; original branch saved to $state_file."
  echo "review_start: leave inline comments, then run review_done when finished."
}

review_done() {
  local review_branch="${REVIEW_BRANCH_NAME:-${USER}/review_in_progress}"
  local review_commit_msg="${1:-review comments}"
  local git_dir="$(_review_helper_git_dir)"
  if [ -z "$git_dir" ]; then
    echo "review_done: not inside a git repository."
    return 1
  fi

  local state_file="$(_review_helper_state_file)" || return 1
  if [ ! -f "$state_file" ]; then
    echo "review_done: no review session detected (missing $state_file)."
    return 1
  fi

  local original_branch
  original_branch=$(<"$state_file")
  if [ -z "$original_branch" ]; then
    echo "review_done: stored original branch is empty; inspect $state_file."
    return 1
  fi

  local current_branch
  current_branch=$(git branch --show-current)
  if [ "$current_branch" != "$review_branch" ]; then
    echo "review_done: currently on '$current_branch'. Please switch to '$review_branch' before finishing."
    return 1
  fi

  if ! git reset "$original_branch"; then
    echo "review_done: git reset to '$original_branch' failed."
    return 1
  fi

  if ! git switch "$original_branch"; then
    echo "review_done: unable to switch to '$original_branch'."
    return 1
  fi

  if ! git branch -d "$review_branch"; then
    echo "review_done: failed to delete review branch '$review_branch'."
    return 1
  fi

  local tracked_changes
  tracked_changes=$(git status --porcelain --untracked-files=no)
  if [ -z "$tracked_changes" ]; then
    echo "review_done: no tracked review comments to commit; working tree is clean."
    rm -f "$state_file"
    return 0
  fi

  if ! git commit -am "$review_commit_msg"; then
    echo "review_done: failed to commit review comments."
    return 1
  fi

  rm -f "$state_file"
  echo "review_done: review comments committed on '$original_branch'."
}
