#!/bin/bash
# Runs on aerospace_workspace_change, front_app_switched and display_change.
# One aerospace call for windows, one sketchybar call for all nine items.
export PATH="/opt/homebrew/bin:$PATH"

PURPLE=0xffbd93f9
COMMENT=0xff6272a4
FOREGROUND=0xfff8f8f2

# aerospace sets FOCUSED_WORKSPACE for its own event only.
FOCUSED="${FOCUSED_WORKSPACE:-$(aerospace list-workspaces --focused 2>/dev/null)}"

MONITOR_COUNT=$(aerospace list-monitors 2>/dev/null | wc -l | tr -d ' ')
EXTERNAL=off
[ "$MONITOR_COUNT" -gt 1 ] && EXTERNAL=on

# First app per workspace, bash 3.2 style.
while IFS='|' read -r ws app; do
  eval "[ -z \"\$WS_${ws}\" ] && WS_${ws}=\"\$app\""
done < <(aerospace list-windows --all --format '%{workspace}|%{app-name}' 2>/dev/null)

ARGS=()
SHOW_SEPARATOR=off
for sid in 1 2 3 4 5 6 7 8 9; do
  eval "app=\"\$WS_${sid}\""
  if [ -n "$app" ]; then
    label="${sid}${app:0:1}"
  else
    label="$sid"
  fi

  # 1-5 always. 6-9 when a second monitor is up, or the workspace is in use.
  drawing=on
  if [ "$sid" -ge 6 ]; then
    drawing=$EXTERNAL
    if [ -n "$app" ] || [ "$sid" = "$FOCUSED" ]; then drawing=on; fi
    [ "$drawing" = on ] && SHOW_SEPARATOR=on
  fi

  if [ "$sid" = "$FOCUSED" ]; then
    ARGS+=(--set "space.$sid"
      drawing=$drawing
      label="$label"
      background.drawing=on
      background.color=$PURPLE
      label.color=$FOREGROUND)
  else
    ARGS+=(--set "space.$sid"
      drawing=$drawing
      label="$label"
      background.drawing=off
      label.color=$COMMENT)
  fi
done

sketchybar --set separator drawing=$SHOW_SEPARATOR "${ARGS[@]}"
