# dotfiles

Managed with [chezmoi](https://www.chezmoi.io). Three groups, set in `.chezmoiignore`:

- **shared:** fish, kitty, mise, neovim, the Claude Code status line
- **macOS:** herdr, starship, atuin, AeroSpace, sketchybar, borders, Karabiner,
  Hammerspoon, git identity, the setup scripts
- **Linux (Arch + Hyprland):** hypr, waybar, mako, fuzzel, tmux, gdb, podman,
  ncspot, a few fish functions

Shared files handle the OS difference in one of three ways: a runtime check
(`uname` in fish), kitty's `include ${KITTY_OS}.conf`, or a chezmoi template
(`mise/config.toml.tmpl`, `fish_plugins.tmpl`). `~/.claude/settings.json` is
not tracked; `dot_claude/modify_settings.json` sets only its `statusLine` key.

## first time setup

### macOS

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install chezmoi
chezmoi init --apply clayharmon
```

### arch linux

```
sudo pacman -S chezmoi git
chezmoi init --apply clayharmon
```

On Linux this only writes the config files. No scripts run, and packages are
installed by hand.

`chezmoi init --apply` writes the dotfiles. On macOS it then runs the scripts
below in order. Scripts 02 to 05 need `sudo` at some point, so run it in a
terminal you are watching.

## what the scripts do (macOS)

1. `01-bootstrap`: Homebrew (macOS), mise, node/python/ruby, rustup
2. `02-packages`: CLI tools, kitty, herdr, Claude Code, apps. macOS also gets AeroSpace, sketchybar, borders
3. `03-shell-setup`: fish as login shell, fisher plugins, herdr completions and plugins
4. `04-macos-defaults`: Dock, Finder, keyboard, hidden menu bar, starts the sketchybar, borders and herdr services
5. `05-firefox`: Firefox Developer Edition policies and `user.js`. On a new machine it fails until Firefox has made a profile: open Firefox Developer Edition once, quit it, run `chezmoi apply`

Scripts are `run_once_`: chezmoi runs each one the first time it sees that exact
content. Editing a script makes it run again on the next `chezmoi apply`. On a
machine that is already set up, skip them with `chezmoi apply --exclude=scripts`.

## daily workflow

```
chezmoi add ~/.config/something      # track a new file
chezmoi re-add                       # re-import all changed files (skips templates)
chezmoi diff                         # see what would change
chezmoi apply                        # apply changes from repo to ~
chezmoi update                       # pull remote + apply
chezmoi cd                           # cd into the repo
```

## push changes

```
chezmoi cd
git add -A && git commit -m "update" && git push
```

## secrets

API keys are not in this repo and never in `fish_variables`. `secrets edit` stores
them age-encrypted in `~/.config/fish/secrets.env.age`; `secrets` exports them
into the current shell. The age key lives in `~/.config/sops/age/shell.txt` and is
copied to a new machine by hand.

## work machines

`chezmoi init` asks once whether this is a work machine and writes `work = true`
into `~/.config/chezmoi/chezmoi.toml`. That flag switches: work git identity, the
PR Monitor sketchybar item, no Firefox/Docker/Bitwarden/Spotify, no herdr plugins.

This repo is public, so nothing employer-specific is in it. On a work machine
`CLAUDE.md` imports `~/.claude/CLAUDE.work.md`, a local file that is never
committed; copy it to a new work machine by hand.

## not in this repo

`~/.claude/settings.json`. Claude Code rewrites it (plugins, accepted prompts,
effort) and it differs per machine, so it is set up by hand once per machine.
