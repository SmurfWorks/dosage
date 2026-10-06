#!/bin/sh
# Remember that this agent turn edited the repo, so the stop hook can rebuild once.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

cd "$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)" || exit 0

python3 -c '
import json, os, sys
data = json.load(sys.stdin)
path = data.get("file_path") or ""
if not path:
    sys.exit(0)
root = os.getcwd()
try:
    rel = os.path.relpath(os.path.realpath(path), os.path.realpath(root))
except ValueError:
    sys.exit(0)
if rel.startswith("..") or rel == "docs" or rel.startswith("docs" + os.sep) or rel.startswith(".git" + os.sep):
    sys.exit(0)
marker = os.path.join(root, ".git", "cursor-rebuild")
open(marker, "a").close()
' || exit 0
