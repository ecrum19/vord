#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ASSETS_DIR="$ROOT_DIR/docs/assets"
MAIN_PAGE="$ROOT_DIR/docs/index.html"
MAIN_PAGE_BACKUP=""

mkdir -p "$ASSETS_DIR"

# Preserve manual edits to docs/index.html from any generator-side side effects.
if [[ -f "$MAIN_PAGE" ]]; then
  MAIN_PAGE_BACKUP="$(mktemp)"
  cp "$MAIN_PAGE" "$MAIN_PAGE_BACKUP"
fi

cp "$ROOT_DIR/vocab/vord.ttl" "$ASSETS_DIR/vord.ttl"
cp "$ROOT_DIR/shapes/vord.shacl.ttl" "$ASSETS_DIR/vord.shacl.ttl"
cp "$ROOT_DIR/shex/vord.shex" "$ASSETS_DIR/vord.shex"
cp "$ROOT_DIR/spec/index.html" "$ASSETS_DIR/vocabulary-usage-specification.html"
rm -f "$ASSETS_DIR/usage-profile.html"
rm -f "$ASSETS_DIR/ontology-graph-data.json" \
      "$ASSETS_DIR/ontology-relationships-overview.json" \
      "$ASSETS_DIR/ontology-hierarchy.ttl"
cp "$ROOT_DIR/examples/basic-service.ttl" "$ASSETS_DIR/basic-service.ttl"
cp "$ROOT_DIR/examples/exhaustive-service.ttl" "$ASSETS_DIR/exhaustive-service.ttl"
cp "$ROOT_DIR/examples/wikidata-rate-restrictions.ttl" "$ASSETS_DIR/wikidata-rate-restrictions.ttl"

node "$ROOT_DIR/scripts/build-ontology-graph-data.mjs" "$ROOT_DIR"
node "$ROOT_DIR/scripts/build-vocab-graph-preview-png.mjs" "$ROOT_DIR"
node "$ROOT_DIR/scripts/build-ontology-hierarchy-ttl.mjs" "$ROOT_DIR"
node "$ROOT_DIR/scripts/build-ontology-reference.mjs" "$ROOT_DIR"
node "$ROOT_DIR/scripts/build-term-pages.mjs" "$ROOT_DIR"

if [[ -n "$MAIN_PAGE_BACKUP" ]]; then
  if ! cmp -s "$MAIN_PAGE_BACKUP" "$MAIN_PAGE"; then
    cp "$MAIN_PAGE_BACKUP" "$MAIN_PAGE"
    echo "Restored docs/index.html to preserve manual edits."
  fi
  rm -f "$MAIN_PAGE_BACKUP"
fi

: > "$ROOT_DIR/docs/.nojekyll"

echo "Synced docs assets to $ASSETS_DIR"
