#!/bin/sh
set -e

pnpm build

_error=0

for _fixture in */; do
  _fixture=$(echo $_fixture | sed 's/.$//')
  _read=$(cat "$_fixture/output.au")
  _run=$(cd $_fixture && node ../../lib_js/bin.js .)
  if [ "$_read" = "$_run" ]; then
    echo "✔ $_fixture"
  else
    _error=1
    echo "✗ $_fixture"
    echo "*** read ***\n$_read\n*** run  ***\n$_run\n***"
  fi
done

exit $_error
