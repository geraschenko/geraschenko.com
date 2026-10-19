# Helpers for reviewing AI-generated changes in a normal Git diff UI.
# Source this file from your ~/.bashrc.
#
# The review branch for branch B is "review__B", so the review branch name
# alone records where review_done returns to, and each worktree can review
# its own branch concurrently.

_review_helper_prefix="review__"

review_start() {
  local commit_message="${1:-snapshot}"
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "review_start: not inside a git repository."
    return 1
  fi

  local original_branch
  original_branch=$(git branch --show-current)
  if [ -z "$original_branch" ]; then
    echo "review_start: unable to determine current branch (detached HEAD?)."
    return 1
  fi

  if [[ "$original_branch" == "$_review_helper_prefix"* ]]; then
    echo "review_start: already reviewing on '$original_branch'. Run review_done first."
    return 1
  fi

  local review_branch="$_review_helper_prefix$original_branch"
  if git show-ref --quiet --verify "refs/heads/$review_branch"; then
    echo "review_start: branch '$review_branch' already exists (abandoned review?). Delete it first."
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

  echo "review_start: review branch '$review_branch' ready."
  echo "review_start: leave inline comments, then run review_done when finished."
}

review_done() {
  local review_commit_msg="${1:-review feedback}"
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "review_done: not inside a git repository."
    return 1
  fi

  local review_branch
  review_branch=$(git branch --show-current)
  if [[ "$review_branch" != "$_review_helper_prefix"* ]]; then
    echo "review_done: '$review_branch' is not a review branch (expected prefix '$_review_helper_prefix')."
    return 1
  fi

  local original_branch="${review_branch#"$_review_helper_prefix"}"
  if ! git show-ref --quiet --verify "refs/heads/$original_branch"; then
    echo "review_done: original branch '$original_branch' does not exist."
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
    echo "review_done: no tracked review feedback to commit; working tree is clean."
    return 0
  fi

  if ! git commit -am "$review_commit_msg"; then
    echo "review_done: failed to commit review feedback."
    return 1
  fi

  local review_commit
  review_commit=$(git rev-parse HEAD)
  local tmux_note=""
  if [ -n "$TMUX" ] && tmux set-buffer -- "$review_commit"; then
    tmux_note=" (copied to tmux paste buffer)"
  fi
  echo "review_done: committed on '$original_branch' as $review_commit$tmux_note"
}
