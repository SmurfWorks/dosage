"""Rebuild the GitHub Pages output (docs/) after an agent turn that edited the repo.

One script serves every agent; only the input/output JSON shapes differ.

  mark  - after a file edit: if the edited path is in the repo (and not docs/ or
          .git/), drop a marker so the end-of-turn hook knows to rebuild.
  stop  - at the end of the agent's turn: if the marker exists, run
          `npm run build`; if that fails, ask the agent to fix it (at most
          MAX_RETRIES times in a row, so a broken build can't loop forever).
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), "..", ".."))
MAX_RETRIES = 2
BUILD_LOG = "/tmp/insulin-calculator-build.log"
AGENTS = {"cursor", "claude", "codex", "gemini"}


def git_path(name):
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--git-path", name],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout.strip()
        return os.path.join(ROOT, out)
    except Exception:
        return os.path.join(ROOT, ".git", name)


MARKER = git_path("agent-rebuild")
RETRIES = git_path("agent-rebuild-retries")


def read_input():
    try:
        return json.load(sys.stdin)
    except Exception:
        return {}


def edited_paths(data):
    """Collect edited file paths from any agent's hook payload."""
    paths = []
    if data.get("file_path"):  # Cursor afterFileEdit
        paths.append(data["file_path"])
    tool_input = data.get("tool_input") or {}
    if isinstance(tool_input, dict):
        # Claude Code Edit/Write/MultiEdit/NotebookEdit, Gemini write_file/replace
        for key in ("file_path", "notebook_path", "absolute_path", "path"):
            if isinstance(tool_input.get(key), str):
                paths.append(tool_input[key])
        # Codex apply_patch: paths live inside the patch text
        patch = tool_input.get("command") or tool_input.get("input") or ""
        if isinstance(patch, list):
            patch = "\n".join(str(p) for p in patch)
        if isinstance(patch, str):
            paths += re.findall(
                r"^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$",
                patch, re.M,
            )
    base = data.get("cwd") or os.getcwd()
    return [p if os.path.isabs(p) else os.path.join(base, p) for p in paths]


def touches_source(path):
    try:
        rel = os.path.relpath(os.path.realpath(path), ROOT)
    except ValueError:
        return False
    first = rel.split(os.sep, 1)[0]
    return not (rel.startswith("..") or first in ("docs", ".git"))


def mark(data):
    if any(touches_source(p) for p in edited_paths(data)):
        open(MARKER, "a").close()


def build():
    """Run npm run build; return None on success, or a failure message."""
    script = r'''
if ! command -v npm >/dev/null 2>&1; then
  herd_nvm="$HOME/Library/Application Support/Herd/config/nvm/nvm.sh"
  if [ -s "$herd_nvm" ]; then
    export NVM_DIR="$HOME/Library/Application Support/Herd/config/nvm"
    . "$herd_nvm"
  fi
fi
command -v npm >/dev/null 2>&1 || exit 127
npm run build
'''
    with open(BUILD_LOG, "w") as log:
        code = subprocess.run(["sh", "-c", script], cwd=ROOT, stdout=log, stderr=subprocess.STDOUT).returncode
    if code == 0:
        return None
    if code == 127:
        return "npm is not on PATH, so the app was not rebuilt. Fix the environment and run npm run build."
    try:
        with open(BUILD_LOG) as log:
            tail = "".join(log.readlines()[-30:]).strip()
    except Exception:
        tail = ""
    msg = "npm run build failed after your edits. Fix the failure so the GitHub Pages output in docs is up to date."
    return f"{msg}\n\nLast lines of {BUILD_LOG}:\n{tail}" if tail else msg


def bump_retries(reset=False):
    if reset:
        if os.path.exists(RETRIES):
            os.remove(RETRIES)
        return 0
    try:
        n = int(open(RETRIES).read().strip() or 0)
    except Exception:
        n = 0
    n += 1
    with open(RETRIES, "w") as f:
        f.write(str(n))
    return n


def stop(agent, data):
    if agent == "cursor" and data.get("status") != "completed":
        return None
    # A fresh turn (not one we forced) starts a new retry budget.
    if agent != "cursor" and not data.get("stop_hook_active"):
        bump_retries(reset=True)
    if not os.path.exists(MARKER):
        return None
    os.remove(MARKER)
    failure = build()
    if failure is None:
        bump_retries(reset=True)
        return None
    if agent != "cursor" and bump_retries() > MAX_RETRIES:
        return None  # give up quietly; the pre-commit hook will still catch it
    return failure


def respond(agent, failure):
    if agent == "cursor":
        out = {"followup_message": failure} if failure else {}
    elif agent == "gemini":
        out = {"decision": "deny", "reason": failure} if failure else {}
    else:  # claude, codex
        out = {"decision": "block", "reason": failure} if failure else {}
    print(json.dumps(out))


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("mark", "stop") or sys.argv[2] not in AGENTS:
        print("usage: hook.sh <mark|stop> <cursor|claude|codex|gemini>", file=sys.stderr)
        return
    action, agent = sys.argv[1], sys.argv[2]
    data = read_input()
    try:
        if action == "mark":
            mark(data)
            if agent == "gemini":
                print("{}")
        else:
            respond(agent, stop(agent, data))
    except Exception as exc:  # never break the agent over a hook
        print(f"agent hook error: {exc}", file=sys.stderr)
        if action == "stop" or agent == "gemini":
            print("{}")


if __name__ == "__main__":
    main()
