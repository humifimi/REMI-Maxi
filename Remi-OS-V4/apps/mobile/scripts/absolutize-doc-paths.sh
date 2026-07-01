#!/usr/bin/env bash
#
# absolutize-doc-paths.sh — rewrite cross-repo doc references to absolute paths.
#
# Why:
#   Agents working in OTHER repos (REMIBackend, REMITechnician, REMIDashboard,
#   REMICustomer, etc.) cannot resolve `docs/pdf-implementation-plans/...`
#   because that folder lives in /Users/jacegalloway/Documents/Docs. Pasting a
#   prompt that says `Read docs/pdf-implementation-plans/foo.md` into a Cursor
#   chat in REMIBackend will fail — the agent doesn't know where to look.
#   Absolute paths make every cross-repo reference unambiguous.
#
# What it does:
#   - Rewrites bare `docs/pdf-implementation-plans/...` and the legacy
#     `Docs/docs/pdf-implementation-plans/...` form to the absolute path
#     `/Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans/...`.
#   - Idempotent: already-absolute paths are left alone (lookbehind blocks
#     anything preceded by a path-like character).
#   - Safe: only touches `*.md` and `*.mdc` files. Skips `node_modules/`,
#     `.git/`, the docs site loader (`docs/assets/`), and itself.
#   - Leaves URL-encoded forms (`pdf-implementation-plans%2F...`) and
#     per-repo paths (`docs/implementation-plans/...`, no `pdf-` prefix)
#     untouched — those are correctly relative in their own contexts.
#
# Usage:
#   scripts/absolutize-doc-paths.sh                   # scan whole repo
#   scripts/absolutize-doc-paths.sh path/to/file.md   # process one file
#   scripts/absolutize-doc-paths.sh --check           # exit 1 if any bare
#                                                     # refs would be rewritten
#
# Hook integration: see .cursor/hooks/absolutize-paths.sh — it calls this
# script with the single file path the agent just edited.

set -euo pipefail

# Where to scan when invoked with no file args. Defaults to the repo this
# script lives in (so the same script works in Docs and every REMI repo).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# The absolute prefix we rewrite TO is always the Docs workspace — that's
# where the cross-repo content lives.
DOCS_ABS="/Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans"

is_excluded() {
  case "$1" in
    *"/node_modules/"*) return 0 ;;
    *"/.git/"*) return 0 ;;
    *"/docs/assets/"*) return 0 ;;
    *"/scripts/absolutize-doc-paths.sh") return 0 ;;
    *"/.cursor/hooks/absolutize-paths.sh") return 0 ;;
    # Meta-rule documents the convention itself and intentionally shows the
    # bare form in prose. Exempted from rewrite/check.
    *"/.cursor/rules/absolute-doc-paths.mdc") return 0 ;;
  esac
  return 1
}

is_target_ext() {
  case "$1" in
    *.md|*.mdc) return 0 ;;
  esac
  return 1
}

rewrite_file() {
  local file="$1"
  if is_excluded "$file"; then return 0; fi
  if ! is_target_ext "$file"; then return 0; fi
  if [[ ! -f "$file" ]]; then return 0; fi

  # Two passes (order matters — pass 1 first so `Docs/docs/...` becomes the
  # full absolute path; pass 2's lookbehind then sees `/` and skips it).
  #
  # The `(?<![\w/.-])` lookbehind blocks matches that are part of a longer
  # path-like token, which makes the rewrite idempotent and keeps it from
  # mangling already-absolute paths or substrings inside other words.
  DOCS_ABS="$DOCS_ABS" perl -i -pe '
    BEGIN { $abs = $ENV{DOCS_ABS} }
    s|(?<![\w/.\-])Docs/docs/pdf-implementation-plans|$abs|g;
    s|(?<![\w/.\-])docs/pdf-implementation-plans|$abs|g;
  ' "$file"
}

check_file() {
  local file="$1"
  if is_excluded "$file"; then return 0; fi
  if ! is_target_ext "$file"; then return 0; fi
  if [[ ! -f "$file" ]]; then return 0; fi

  perl -ne '
    if (
      /(?<![\w\/.\-])Docs\/docs\/pdf-implementation-plans/ ||
      /(?<![\w\/.\-])docs\/pdf-implementation-plans/
    ) {
      print "$ARGV:$.: $_";
      $main::found = 1;
    }
    END { exit($main::found ? 1 : 0) }
  ' "$file"
}

mode="rewrite"
files=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --check) mode="check"; shift ;;
    --) shift; files+=("$@"); break ;;
    *) files+=("$1"); shift ;;
  esac
done

if [[ ${#files[@]} -eq 0 ]]; then
  cd "$ROOT"
  while IFS= read -r -d '' f; do
    files+=("$f")
  done < <(find . \( -name node_modules -o -name .git \) -prune -o \
                 \( -name '*.md' -o -name '*.mdc' \) -type f -print0)
fi

exit_code=0
for f in "${files[@]}"; do
  if [[ "$mode" == "check" ]]; then
    if ! check_file "$f"; then
      exit_code=1
    fi
  else
    rewrite_file "$f"
  fi
done

exit "$exit_code"
