#!/usr/bin/env bash
set -euo pipefail

session_id="${1:-${OPENCODE_TREE_E2E_SESSION_ID:-}}"
if [[ -z "$session_id" ]]; then
  echo "usage: $0 <session-id>" >&2
  exit 2
fi
if [[ ! "$session_id" =~ ^ses_[A-Za-z0-9]+$ ]]; then
  echo "invalid session id: $session_id" >&2
  exit 2
fi

name="opencode-tree-e2e-$$"

cleanup() {
  tmux kill-session -t "$name" 2>/dev/null || true
}
trap cleanup EXIT

screen() {
  tmux capture-pane -t "$name":0.0 -p -S -80
}

fail() {
  echo "$1" >&2
  screen >&2 || true
  exit 1
}

tmux new-session -d -s "$name" -x 120 -y 40 "opencode --session $session_id"
tmux set-option -t "$name" remain-on-exit on

for _ in {1..50}; do
  if screen | grep -Fq "ctrl+p commands"; then
    break
  fi
  sleep 0.1
done

screen | grep -Fq "ctrl+p commands" || fail "OpenCode did not reach the session route"

tmux send-keys -t "$name":0.0 -l "/tree"
tmux send-keys -t "$name":0.0 Enter

for _ in {1..50}; do
  current_screen="$(screen)"
  if grep -Fq "move •" <<<"$current_screen" &&
    grep -Fq "SESSION [CURRENT]" <<<"$current_screen" &&
    ! grep -Fq "Loading tree ownership" <<<"$current_screen"; then
    break
  fi
  if [[ "$(tmux display-message -p -t "$name":0.0 '#{pane_dead}')" == "1" ]]; then
    fail "OpenCode exited while opening /tree"
  fi
  sleep 0.1
done

current_screen="$(screen)"
if ! grep -Fq "move •" <<<"$current_screen" ||
  ! grep -Fq "SESSION [CURRENT]" <<<"$current_screen" ||
  grep -Fq "Loading tree ownership" <<<"$current_screen"; then
  fail "/tree did not finish loading"
fi

tmux send-keys -t "$name":0.0 Escape
for _ in {1..20}; do
  if screen | grep -Fq "ctrl+p commands"; then
    break
  fi
  sleep 0.1
done

screen | grep -Fq "ctrl+p commands" || fail "Escape did not return to the session route"
echo "PASS: /tree loaded and Escape returned to the session"
