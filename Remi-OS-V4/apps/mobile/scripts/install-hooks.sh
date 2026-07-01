#!/usr/bin/env bash
#
# install-hooks.sh — point this clone's git at .githooks/.
#
# Run once per clone. Sets `core.hooksPath = .githooks` so the versioned
# `.githooks/commit-msg` (and any future hooks) fire on every git
# operation, regardless of how the commit was invoked (CLI, GUI, agent).
#
# Idempotent: safe to re-run.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

current="$(git config --local --get core.hooksPath || echo "")"

if [[ "$current" == ".githooks" ]]; then
  echo "OK: core.hooksPath already set to .githooks."
else
  if [[ -n "$current" && "$current" != ".githooks" ]]; then
    echo "WARN: existing core.hooksPath = '$current'. Overwriting." >&2
  fi
  git config --local core.hooksPath .githooks
  echo "OK: core.hooksPath set to .githooks for this clone."
fi

# Ensure all hook scripts are executable (in case git checkout dropped
# the +x bit on some platforms).
chmod +x .githooks/* 2>/dev/null || true

echo
echo "Hooks now active in this clone:"
ls -1 .githooks/ 2>/dev/null | sed 's/^/  - /'
echo
echo "To verify the commit-msg hook fires, try:"
echo "  git checkout main 2>/dev/null && echo 'test' > /tmp/m && git commit -F /tmp/m  # should be refused"
