#!/bin/sh
# After an agent turn that changed the repo, rebuild the GitHub Pages output.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)" || {
  printf '%s\n' '{}'
  exit 0
}

input=$(cat)
status=$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("status",""))' 2>/dev/null || true)
marker=".git/cursor-rebuild"

if [ "$status" != "completed" ] || [ ! -f "$marker" ]; then
  printf '%s\n' '{}'
  exit 0
fi

rm -f "$marker"

if ! command -v npm >/dev/null 2>&1; then
  herd_nvm="$HOME/Library/Application Support/Herd/config/nvm/nvm.sh"
  if [ -s "$herd_nvm" ]; then
    export NVM_DIR="$HOME/Library/Application Support/Herd/config/nvm"
    # shellcheck disable=SC1090
    . "$herd_nvm"
  fi
fi

if ! command -v npm >/dev/null 2>&1; then
  printf '%s\n' '{"followup_message":"npm is not on PATH, so the app was not rebuilt. Fix the environment and run npm run build."}'
  exit 0
fi

if npm run build >/tmp/insulin-calculator-build.log 2>&1; then
  printf '%s\n' '{}'
else
  printf '%s\n' '{"followup_message":"npm run build failed after your edits. Fix the failure so the GitHub Pages output in docs is up to date."}'
fi
exit 0
