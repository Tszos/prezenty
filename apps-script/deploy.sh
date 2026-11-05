#!/bin/bash
# Pushes Code.gs + appsscript.json to every list in lists.txt.
#   ./deploy.sh push      upload code only (deployed web apps keep running the old version)
#   ./deploy.sh redeploy  upload code and move each existing deployment to it (URLs stay the same)
# Optional second argument limits it to one list, e.g. ./deploy.sh redeploy ania
# Needs `clasp login` once and the Apps Script API turned on at https://script.google.com/home/usersettings.
set -euo pipefail
mode=${1:-}; only=${2:-}
[[ $mode == push || $mode == redeploy ]] || { echo "usage: $0 push|redeploy [name]"; exit 1; }
here=$(cd "$(dirname "$0")" && pwd)
clasp() { npx -y @google/clasp@latest "$@"; }
while read -r name script deployment; do
  [[ -z $name || $name == \#* ]] && continue
  [[ -n $only && $only != "$name" ]] && continue
  tmp=$(mktemp -d)
  cp "$here/Code.gs" "$here/appsscript.json" "$tmp/"
  printf '{"scriptId":"%s"}' "$script" > "$tmp/.clasp.json"
  echo "== $name"
  (cd "$tmp" && clasp push --force)
  if [[ $mode == redeploy ]]; then
    (cd "$tmp" && clasp update-deployment "$deployment" -d "$(date +%F) $(git -C "$here" rev-parse --short HEAD 2>/dev/null || echo local)")
  fi
  rm -rf "$tmp"
done < "$here/lists.txt"
