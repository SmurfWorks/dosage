#!/bin/sh
# Point this clone's pre-commit hook at the script in the repository.
set -e

cd "$(dirname "$0")/.."

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

hooks=$(git rev-parse --git-path hooks)
mkdir -p "$hooks"
chmod +x .githooks/pre-commit
ln -sfn "$(pwd)/.githooks/pre-commit" "$hooks/pre-commit"
