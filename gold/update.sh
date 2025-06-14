#!/bin/sh
set -e

pnpm build

for _fixture in */; do
  (cd $_fixture && node ../../lib_js/bin.js .) > "$_fixture/output.au"
done
