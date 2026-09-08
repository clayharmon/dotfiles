#!/bin/bash
# Herdr agents that need you. Label is "waiting/total".
# States come from `herdr agent list`: idle, working, approval, question.
export PATH="/opt/homebrew/bin:$PATH"

RED=0xffff5555
COMMENT=0xff6272a4
GREEN=0xff50fa7b

JSON=$(herdr agent list 2>/dev/null) || { sketchybar --set "$NAME" drawing=off; exit 0; }

TOTAL=$(printf '%s' "$JSON" | jq '.result.agents | length' 2>/dev/null)
if [ -z "$TOTAL" ] || [ "$TOTAL" -eq 0 ]; then
  sketchybar --set "$NAME" drawing=off
  exit 0
fi

WAITING=$(printf '%s' "$JSON" | jq '[.result.agents[] | select(.agent_status == "approval" or .agent_status == "question")] | length')
WORKING=$(printf '%s' "$JSON" | jq '[.result.agents[] | select(.agent_status == "working")] | length')

if [ "$WAITING" -gt 0 ]; then
  COLOR=$RED
elif [ "$WORKING" -gt 0 ]; then
  COLOR=$GREEN
else
  COLOR=$COMMENT
fi

sketchybar --set "$NAME" drawing=on label="${WAITING}/${TOTAL}" icon.color=$COLOR label.color=$COLOR
