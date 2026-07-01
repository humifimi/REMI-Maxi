#!/usr/bin/env bash
#
# check-branch-chunk.sh — branch-hygiene helper.
#
# This script's old job (chunk-ID validation for the master-plan
# workflow) is retired. It now does two simple things:
#
#   1. Create a new branch off whatever HEAD currently is (so new
#      branches naturally stack on the latest work tip instead of
#      reaching back to stale `main`).
#   2. Warn if you're standing on `main` or `master`.
#
# Modes:
#   check-branch-chunk.sh
#       No args. Warn if on main/master. Exit 0 either way (the
#       commit hooks are the actual block; this is just a heads-up).
#
#   check-branch-chunk.sh --create <branch-name>
#       Create and check out `<branch-name>` off current HEAD.
#       Example:
#         ./scripts/check-branch-chunk.sh --create fix/oauth-token-leak
#
#   check-branch-chunk.sh --help
#       Print this header.
#
# Exit codes:
#   0  success (including "you're on main, here's a heads-up")
#   2  bad invocation
#
# See .cursor/rules/branch-hygiene.mdc for the human-facing convention.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

current_branch() { git rev-parse --abbrev-ref HEAD; }

case "${1:-}" in
  --help|-h)
    sed -n '2,30p' "$0"
    exit 0
    ;;

  --create)
    if [[ -z "${2:-}" ]]; then
      echo "usage: $0 --create <branch-name>" >&2
      echo "example: $0 --create fix/oauth-token-leak" >&2
      exit 2
    fi
    new_branch="$2"
    base="$(current_branch)"
    if [[ "$base" == "HEAD" ]]; then
      # Detached HEAD — refuse, the user almost certainly didn't mean this.
      echo "FAIL: HEAD is detached. Check out a branch first, then re-run." >&2
      exit 2
    fi
    if git rev-parse --verify --quiet "$new_branch" >/dev/null; then
      echo "FAIL: branch '$new_branch' already exists. Pick another name or" >&2
      echo "      'git checkout $new_branch' if you meant to switch to it." >&2
      exit 2
    fi
    git checkout -b "$new_branch"
    echo "OK: created and checked out '$new_branch' off '$base'."
    ;;

  "")
    branch="$(current_branch)"
    if [[ "$branch" == "main" || "$branch" == "master" ]]; then
      echo "WARN: on '$branch'. Commits will be blocked by the hooks." >&2
      echo "      Start a branch first:" >&2
      echo "        ./scripts/check-branch-chunk.sh --create <branch-name>" >&2
    else
      echo "OK: on '$branch'."
    fi
    exit 0
    ;;

  *)
    echo "FAIL: unknown argument '$1'." >&2
    echo "usage: $0 [--create <branch-name>] [--help]" >&2
    exit 2
    ;;
esac
