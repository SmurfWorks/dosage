#!/bin/sh
# Shared entry point for agent hooks (Cursor, Claude Code, Codex, Gemini CLI).
# Usage: hook.sh <mark|stop> <cursor|claude|codex|gemini>   (hook JSON on stdin)
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
dir=$(CDPATH= cd -- "$(dirname "$0")" && pwd) || exit 0
exec python3 "$dir/agent_hook.py" "$@"
