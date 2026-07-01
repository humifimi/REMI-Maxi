#!/usr/bin/env bash
# Sync the profit-model engine TS source from REMIBackend into vendor/profit-model.
# The engine is a leaf module (no Node-only APIs) so the raw .ts files compile
# cleanly under Expo / Metro. See spec §2 Architecture.
set -e
SRC="../REMIBackend/src/shared/profit-model"
DST="vendor/profit-model"
if [ ! -d "$SRC" ]; then
  echo "ERROR: $SRC not found. Is REMIBackend cloned next to this repo?"
  exit 1
fi
rm -rf "$DST"
mkdir -p "$DST"
cp "$SRC"/*.ts "$DST"/
rm -f "$DST"/*.test.ts
cat > "$DST/README.md" <<'EOF'
# vendor/profit-model

**DO NOT EDIT THESE FILES.**
Auto-synced from REMIBackend/src/shared/profit-model.
To pull engine updates, run: `npm run sync:profit-model`
Source spec: /Users/jacegalloway/Documents/Docs/docs/pdf-implementation-plans/plans/profit-model-v2-spec.md §2 Architecture.
EOF
echo "Synced profit-model engine ($(ls "$DST"/*.ts | wc -l | xargs) files)."
