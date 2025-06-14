#!/bin/sh
set -e

pnpm build

for _fixture in */; do
  _fixture=$(echo $_fixture | sed 's/.$//')
  (cd $_fixture && node ../../lib_js/bin.js .) > "$_fixture/output.au"
  echo "*** $_fixture ***"
  cat "$_fixture/output.au"
done
