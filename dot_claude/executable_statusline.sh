#!/bin/bash
# Claude Code status line: model · effort · context used, in Dracula colors.
# Claude Code pipes a JSON description of the session on stdin.
# Wired up by modify_settings.json (the statusLine key).
input=$(cat)
model=$(jq -r '.model.display_name // empty' <<<"$input")
effort=$(jq -r '.effort.level // empty' <<<"$input")
ctx=$(jq -r '.context_window.used_percentage // empty' <<<"$input")

purple='\033[38;2;189;146;248m'
grey='\033[38;2;98;114;164m'
cyan='\033[38;2;138;233;252m'
green='\033[38;2;80;250;123m'
reset='\033[0m'

printf "${purple}%s${reset}" "$model"
[ -n "$effort" ] && printf "${grey} · ${cyan}%s${reset}" "$effort"
[ -n "$ctx" ] && printf "${grey} · ${green}ctx %.0f%%${reset}" "$ctx"
echo
