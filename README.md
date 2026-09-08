# dotfiles

Managed with [chezmoi](https://www.chezmoi.io). fish, kitty, herdr, neovim,
starship, atuin. On macOS: AeroSpace, sketchybar, borders, Karabiner, Hammerspoon.

## first time setup

### macOS

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install chezmoi
chezmoi init --apply clayharmon
```

### arch linux

```
sudo pacman -S chezmoi git ruby
chezmoi init --apply clayharmon
```

### fedora

```
sudo dnf install chezmoi git ruby
chezmoi init --apply clayharmon
```

`chezmoi init --apply` writes the dotfiles, then runs the scripts below in order.
Scripts 02 to 05 need `sudo` at some point, so run it in a terminal you are watching.

## what the scripts do

1. `01-bootstrap`: Homebrew (macOS), mise, node/python/ruby, rustup
2. `02-packages`: CLI tools, kitty, herdr, Claude Code, apps. macOS also gets AeroSpace, sketchybar, borders
3. `03-shell-setup`: fish as login shell, fisher plugins, herdr completions and plugins
4. `04-macos-defaults`: Dock, Finder, keyboard, hidden menu bar, starts the sketchybar, borders and herdr services
5. `05-firefox`: Firefox Developer Edition policies and `user.js`

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
