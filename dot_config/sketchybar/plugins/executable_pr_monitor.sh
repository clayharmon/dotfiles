#!/bin/bash

# Pending review requests — same signal as PR Monitor's menu-bar badge.
# gh authenticates from its own keyring, so no GH_TOKEN plumbing needed.
GH=/opt/homebrew/bin/gh

COMMENT=0xff6272a4
RED=0xffff5555
FOREGROUND=0xfff8f8f2

COUNT=$("$GH" api -X GET search/issues \
  -f q='is:open is:pr review-requested:@me archived:false draft:false' \
  --jq '.total_count' 2>/dev/null)

if [ -n "$COUNT" ] && [ "$COUNT" -gt 0 ] 2>/dev/null; then
  sketchybar --set "$NAME" icon.color=$RED label.color=$FOREGROUND label="$COUNT" label.drawing=on
else
  # zero, or gh unreachable (offline / rate-limited) — dim and drop the count
  sketchybar --set "$NAME" icon.color=$COMMENT label.drawing=off
fi
