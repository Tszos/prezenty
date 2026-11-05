#!/bin/bash
# Stamps every local CSS/JS link in docs/**/*.html with ?v=<timestamp>, so phones load a new
# release as one consistent set (GitHub Pages lets browsers cache each file for 10 minutes).
# Run before committing changes to docs/.
set -euo pipefail
v=$(date +%Y%m%d%H%M)
cd "$(dirname "$0")/../docs"
find . -name '*.html' -print0 | xargs -0 perl -pi -e '
  s{((?:href|src)="(?:\.\./|\./)?(?:[\w-]+/)*[\w.-]+\.(?:css|js))(?:\?v=\d+)?"}{$1?v='"$v"'"}g'
echo "stamped v=$v"
grep -rhoE '(href|src)="[^"]+\.(css|js)\?v=[0-9]+"' --include=*.html . | sort | uniq -c
