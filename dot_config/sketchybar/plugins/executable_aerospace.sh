#!/bin/bash

# Dracula colors
PURPLE=0xffbd93f9
COMMENT=0xff6272a4
FOREGROUND=0xfff8f8f2

# FOCUSED_WORKSPACE is set by aerospace events, but not by front_app_switched or initial load
FOCUSED="${FOCUSED_WORKSPACE:-$(aerospace list-workspaces --focused 2>/dev/null)}"

# Determine which workspaces exist in the bar
MONITOR_COUNT=$(aerospace list-monitors 2>/dev/null | wc -l | tr -d ' ')
if [ "$MONITOR_COUNT" -gt 1 ]; then
  SIDS="1 2 3 4 5 6 7 8 9"
else
  SIDS="1 2 3 4 5"
fi

# Single aerospace call — get first app per workspace
# Parse into simple WS_<n> variables (bash 3.2 compatible)
while IFS='|' read -r ws app; do
  # Only store first app per workspace
  eval "[ -z \"\$WS_${ws}\" ] && WS_${ws}=\"\$app\""
done < <(aerospace list-windows --all --format '%{workspace}|%{app-name}' 2>/dev/null)

# Build one batched sketchybar command
ARGS=()
for sid in $SIDS; do
  eval "app=\"\$WS_${sid}\""
  if [ -n "$app" ]; then
    label="${sid}${app:0:1}"
  else
    label="$sid"
  fi

  if [ "$sid" = "$FOCUSED" ]; then
    ARGS+=(--set "space.$sid"
      label="$label"
      background.drawing=on
      background.color=$PURPLE
      label.color=$FOREGROUND)
  else
    ARGS+=(--set "space.$sid"
      label="$label"
      background.drawing=off
      label.color=$COMMENT)
  fi
done

sketchybar "${ARGS[@]}"
