#!/bin/bash
# Dracula-themed app launcher using choose

SELECTION=$(
  ls /Applications /Applications/Utilities /System/Applications 2>/dev/null \
    | grep '\.app$' \
    | sed 's/\.app$//' \
    | sort -u \
    | choose \
        -b 282a36 \
        -c bd93f9 \
        -u \
        -w 600 \
        -s 20 \
        -f "JetBrainsMono Nerd Font" \
        -n 15 \
        -p "launch" \
        -z \
        -a
)

if [ -n "$SELECTION" ]; then
  open -a "$SELECTION"
fi
