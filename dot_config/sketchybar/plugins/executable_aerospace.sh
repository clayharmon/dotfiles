#!/bin/bash

# Dracula colors
PURPLE=0xffbd93f9
COMMENT=0xff6272a4
FOREGROUND=0xfff8f8f2

SID="$1"

# Get the first window's app name in this workspace
APP=$(aerospace list-windows --workspace "$SID" 2>/dev/null | head -1 | awk -F'|' '{gsub(/^[ \t]+|[ \t]+$/, "", $2); print $2}')

# Build label: workspace number + first char of app (e.g. "1G" for Ghostty)
if [ -n "$APP" ]; then
  INITIAL=$(echo "$APP" | cut -c1)
  LABEL="${SID}${INITIAL}"
else
  LABEL="$SID"
fi

if [ "$SID" = "$FOCUSED_WORKSPACE" ]; then
  sketchybar --set "$NAME" \
    label="$LABEL" \
    background.drawing=on \
    background.color=$PURPLE \
    label.color=$FOREGROUND
else
  sketchybar --set "$NAME" \
    label="$LABEL" \
    background.drawing=off \
    label.color=$COMMENT
fi
