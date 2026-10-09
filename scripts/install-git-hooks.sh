#!/bin/sh
# Point this clone's git hooks at the scripts in the repository.
set -e

cd "$(dirname "$0")/.."

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

hooks=$(git rev-parse --git-path hooks)
mkdir -p "$hooks"
for hook in pre-commit commit-msg; do
  chmod +x ".githooks/$hook"
  ln -sfn "$(pwd)/.githooks/$hook" "$hooks/$hook"
done
