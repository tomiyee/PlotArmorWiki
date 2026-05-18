#!/bin/sh
# In a git worktree, .git is a file pointing to the real git dir — resolve it.
if [ -f .git ]; then
  GIT_DIR=$(sed 's/^gitdir: //' .git)
else
  GIT_DIR=.git
fi

# Walk up to the commondir (shared hooks live there, not the worktree-specific dir).
if [ -f "$GIT_DIR/commondir" ]; then
  COMMON=$(cat "$GIT_DIR/commondir")
  # commondir may be relative to GIT_DIR
  case "$COMMON" in
    /*) HOOKS_DIR="$COMMON/hooks" ;;
    *)  HOOKS_DIR="$GIT_DIR/$COMMON/hooks" ;;
  esac
else
  HOOKS_DIR="$GIT_DIR/hooks"
fi

cp scripts/pre-commit.sh "$HOOKS_DIR/pre-commit"
chmod +x "$HOOKS_DIR/pre-commit"
