# dotfiles

managed with [chezmoi](https://www.chezmoi.io)

## first time setup

### macOS

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install chezmoi
chezmoi init --apply clayharmon
chsh -s $(which fish)
```

### arch linux

```
sudo pacman -S chezmoi git
chezmoi init --apply clayharmon
chsh -s /usr/bin/fish
```

### fedora

```
sudo dnf install chezmoi git
chezmoi init --apply clayharmon
chsh -s /usr/bin/fish
```

## daily workflow

```
chezmoi add ~/.config/something      # track a new file
chezmoi re-add                       # re-import all changed files
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

## what it does

1. installs mise (node, python, ruby)
2. installs cli tools and apps
3. sets fish as default shell
4. applies macos defaults (macos only)
