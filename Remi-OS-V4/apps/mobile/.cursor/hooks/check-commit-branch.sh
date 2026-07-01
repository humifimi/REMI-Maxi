#!/usr/bin/env bash
#
# check-commit-branch.sh — Cursor beforeShellExecution hook for `git commit`.
#
# Single responsibility: refuse any `git commit` that would land on
# `main` or `master`. Everything else passes.
#
# The old chunk-ID logic (extract a chunk ID from the commit subject,
# verify the branch name contains it, verify no other chunks are mixed
# in since `origin/main`) is retired — the master plan that motivated
# it is complete. See .cursor/rules/branch-hygiene.mdc.
#
# Behavior:
#   - Only fires on `git commit` (the matcher in hooks.json filters first).
#   - Skips amends (`git commit --amend`) — those edit existing commits.
#   - Hard-denies any commit on `main` or `master`.
#   - Allows everything else.

set -uo pipefail

input="$(cat)"
command="$(printf '%s' "$input" | jq -r '.command // empty')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"

allow() {
  printf '{"permission":"allow"}\n'
  exit 0
}

deny() {
  local user_msg="$1" agent_msg="$2"
  jq -nc \
    --arg um "$user_msg" \
    --arg am "$agent_msg" \
    '{permission:"deny", user_message:$um, agent_message:$am}'
  exit 0
}

# Only act on `git commit` invoked as an actual command (not appearing in a
# quoted string, --arg value, echo arg, etc.). It must be:
#   - at the very start of the command, OR
#   - directly after a shell separator (&&, ||, ;, |) with whitespace,
# AND followed by whitespace or end-of-string.
if ! [[ "$command" =~ (^[[:space:]]*|[[:space:]](\&\&|\|\||;|\|)[[:space:]]+)git[[:space:]]+commit([[:space:]]|$) ]]; then
  allow
fi

# Allow amends — they don't change which branch the commit lives on.
if [[ "$command" =~ --amend ]]; then
  allow
fi

# Run from repo root so the script paths resolve. Honor the hook's reported
# cwd if Cursor provides one.
if [[ -n "$cwd" && -d "$cwd" ]]; then
  cd "$cwd"
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  allow  # Not in a git repo; nothing for this hook to do.
fi
cd "$REPO_ROOT"

branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"

if [[ "$branch" == "main" || "$branch" == "master" ]]; then
  deny \
    "branch-hygiene: refusing to commit directly to '$branch'." \
    "Hook denied. RUN THIS NEXT: ./scripts/check-branch-chunk.sh --create <branch-name>  (replace <branch-name> with whatever you want, e.g. fix/oauth-token-leak). That branches off the current HEAD and checks the new branch out. Then re-run your commit. See .cursor/rules/branch-hygiene.mdc."
fi

allow
