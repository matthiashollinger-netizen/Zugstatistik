#!/bin/sh
# Führt die Unit-Tests gegen den CORE-Block aus index.html aus.
# Nutzt JavaScriptCore (macOS) oder Node, je nachdem was vorhanden ist.
set -e
cd "$(dirname "$0")/.."

CORE=$(mktemp /tmp/zugstat_core.XXXXXX)
sed -n '/CORE-START/,/CORE-END/p' index.html > "$CORE"

COMBINED=$(mktemp /tmp/zugstat_tests.XXXXXX)
cat "$CORE" tests/tests.js > "$COMBINED"

JSC=/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc
if [ -x "$JSC" ]; then
  "$JSC" "$COMBINED"
elif command -v node >/dev/null 2>&1; then
  node -e "global.print = console.log; require('$COMBINED');"
else
  echo "Weder jsc noch node gefunden." >&2
  exit 1
fi
rm -f "$CORE" "$COMBINED"
