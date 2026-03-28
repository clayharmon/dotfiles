# CLI Tools

When running shell commands, prefer these modern tools over their legacy equivalents:

| Instead of | Use | Notes |
|-----------|-----|-------|
| `ls` | `eza` | supports `--icons`, `--git`, `--tree` |
| `cat` | `bat` | syntax highlighting, `-p` for plain |
| `find` | `fd` | respects .gitignore, sane defaults |
| `grep` | `rg` (ripgrep) | fastest grep, respects .gitignore |
| `cd` | `z` (zoxide) | frecency-based, learns directories |
| `sed` | `sd` | simpler regex syntax |
| `curl` (for APIs) | `xh` | colorized JSON output |
| `du` | `dust` | visual disk usage |
| `diff` | `delta` | syntax-highlighted diffs |

# Editor

Neovim 0.11 with lazy.nvim. Uses native `vim.lsp.config` + `vim.lsp.enable` (not the deprecated `require('lspconfig').setup` pattern). Plugins: fzf-lua, blink.cmp, harpoon2, oil.nvim.

# Shell

Fish shell with starship prompt, zoxide, atuin (shell history). No oh-my-fish, no fisher plugins beyond fzf-fish.

# macOS

AeroSpace (tiling WM), JankyBorders, Ghostty terminal, Karabiner-Elements. Homebrew for packages.
