# ~/.config/fish/config.fish
# Everything the shell needs is in this file. Universal variables
# (fish_variables) hold nothing but fish's own bookkeeping, so chezmoi sees it all.

# PATH. One call keeps this order at the front; nested shells do not duplicate it.
fish_add_path -g \
    $HOME/Library/Android/sdk/platform-tools \
    $HOME/Library/Android/sdk/emulator \
    $HOME/.gem/ruby/3.4.0/bin \
    /opt/homebrew/opt/openjdk/bin \
    /opt/homebrew/opt/postgresql@15/bin \
    /opt/homebrew/opt/icu4c@77/sbin \
    /opt/homebrew/opt/icu4c@77/bin \
    /opt/homebrew/opt/flex/bin \
    /opt/homebrew/opt/make/libexec/gnubin \
    /opt/homebrew/opt/bison/bin \
    /opt/homebrew/opt/gnu-sed/libexec/gnubin \
    /opt/homebrew/opt/gawk/libexec/gnubin \
    /opt/gcc-14.2.0-3-aarch64/bin \
    /opt/homebrew/bin \
    $HOME/.docker/bin \
    $HOME/.local/bin

set -gx EDITOR nvim
set -gx VIRTUAL_ENV_DISABLE_PROMPT true

# macOS-only exports. fish_add_path above already skips directories that do not exist.
if test (uname) = Darwin
    set -gx ANDROID_HOME $HOME/Library/Android/sdk
    set -gx JAVA_HOME /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
    set -gx --path PKG_CONFIG_PATH /opt/homebrew/opt/ncurses/lib/pkgconfig
end

# API keys are not exported at startup. Run `secrets` in a shell that needs them.
# They live age-encrypted in ~/.config/fish/secrets.env.age (see functions/secrets.fish).

if status is-interactive
    set -g fish_greeting
    fish_vi_key_bindings

    # Runtimes: node, python, ruby from ~/.config/mise/config.toml
    command -q mise; and mise activate fish | source

    # Prompt, cd, history. Each guarded so a half-bootstrapped machine still gets a prompt.
    # fzf.fish (conf.d) bound ctrl+r at startup. Re-run its installer without
    # the history binding BEFORE atuin, because it erases whatever it bound.
    functions -q fzf_configure_bindings; and fzf_configure_bindings --history=
    command -q starship; and starship init fish | source
    command -q zoxide; and zoxide init fish --cmd cd | source
    command -q atuin; and atuin init fish --disable-up-arrow | source

    # Lines that carry a secret never reach history or atuin sync.
    function fish_should_add_to_history
        string match -qir -- '(token|secret|api[_-]?key|password)\s*[=:]|\b(sk|hf|ghp|gho|xox[bp])[-_][A-Za-z0-9_-]{8,}' $argv[1]
        and return 1
        return 0
    end

    # Abbreviations expand before running, so history shows the real command.
    abbr -a g git
    abbr -a gs 'git status'
    abbr -a gd 'git diff'
    abbr -a lg lazygit
    abbr -a v nvim
    abbr -a vim nvim

    # Replacements keep their names.
    alias ls="eza --icons"
    alias l="eza -la --icons --git"
    alias ll="eza -l --icons --git"
    alias tree="eza --tree --icons --level=2"
    alias cat="bat"
end
