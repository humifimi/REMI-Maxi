#!/usr/bin/env bash
#
# afterFileEdit hook: absolutize any bare cross-repo doc paths the agent just
# wrote into a markdown file. Thin wrapper around scripts/absolutize-doc-paths.sh
# that targets the single file edited so we don't rescan the whole repo on
# every Write/Edit.
#
# Reads the hook input JSON from stdin, extracts the edited file path, and
# delegates. Fails open — never blocks the edit even if rewriting fails.

set -euo pipefail

# Resolve the repo root from this script's own location so the same hook works
# in Docs and every REMI repo (the hook always lives at .cursor/hooks/...).
HOOK_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HOOK_DIR/../.." && pwd)"
SCRIPT="${ROOT}/scripts/absolutize-doc-paths.sh"

input=$(cat || true)

# Use python3 (always present on macOS) to pull the file path out of the hook
# input. The shape varies slightly across hook events, so we look in the
# common locations. We pass the JSON through an env var instead of stdin so
# we don't collide with python's own heredoc reading sys.stdin.
file_path=$(HOOK_INPUT="$input" /usr/bin/python3 -c '
import json, os, sys
raw = os.environ.get("HOOK_INPUT", "")
try:
    data = json.loads(raw)
except Exception:
    sys.exit(0)
if not isinstance(data, dict):
    sys.exit(0)
for key in ("file_path", "filePath", "path", "target_file"):
    v = data.get(key)
    if isinstance(v, str) and v:
        print(v); sys.exit(0)
ti = data.get("tool_input") or {}
if isinstance(ti, dict):
    for key in ("file_path", "filePath", "path", "target_file"):
        v = ti.get(key)
        if isinstance(v, str) and v:
            print(v); sys.exit(0)
' 2>/dev/null || true)

if [[ -z "${file_path:-}" ]]; then
  exit 0
fi

case "$file_path" in
  /*) abs="$file_path" ;;
  *)  abs="${ROOT}/${file_path}" ;;
esac

case "$abs" in
  *.md|*.mdc) ;;
  *) exit 0 ;;
esac

"$SCRIPT" "$abs" >/dev/null 2>&1 || true
exit 0
