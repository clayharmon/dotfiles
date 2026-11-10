-- LSP without mason: server configs come from nvim-lspconfig's lsp/ directory
-- and nvim 0.11+'s native vim.lsp.config / vim.lsp.enable wire them up. A
-- server is only enabled when its binary is on PATH, so a machine without it
-- just skips it instead of erroring.
--
-- System toolchains (package manager):
--   Arch:  pacman -S clang gopls lua-language-server
--          rustup component add rust-analyzer
--   macOS: brew install llvm gopls lua-language-server
--          rustup component add rust-analyzer
--
-- Ruby / Python / JS servers are user-space installs (no sudo, same on both
-- OSes), all landing in ~/.local/bin (must be on PATH):
--   Ruby:    gem install ruby-lsp   (per mise ruby; run via `mise exec` so the
--            project's .ruby-version wins even when nvim isn't started from
--            fish. RuboCop + Rails support come from the project's bundle.)
--   Python:  uv tool install basedpyright && uv tool install ruff
--   TS/JS:   npm i -g --prefix ~/.local typescript@6 typescript-language-server \
--              vscode-langservers-extracted        (ts_ls + eslint)
--            ts_ls uses the project's own typescript; the global one is only
--            the fallback, pinned to 6 because TS 7 (Go) ships no tsserver.
--   Update:  gem update ruby-lsp; uv tool upgrade --all;
--            npm update -g --prefix ~/.local

-- server name (nvim-lspconfig) -> executable that must exist
local servers = {
    clangd        = "clangd",
    gopls         = "gopls",
    rust_analyzer = "rust-analyzer",
    lua_ls        = "lua-language-server",
    ruby_lsp      = "mise",
    basedpyright  = "basedpyright-langserver",
    ruff          = "ruff",
    ts_ls         = "typescript-language-server",
    eslint        = "vscode-eslint-language-server", -- only attaches with an eslint config
}

return {
    {
        "neovim/nvim-lspconfig",
        config = function()
            vim.lsp.config("clangd", {
                cmd = { "clangd", "--background-index", "--clang-tidy", "--header-insertion=never" },
            })

            vim.lsp.config("lua_ls", {
                settings = {
                    Lua = {
                        diagnostics = {
                            globals = { "vim" },
                        },
                    },
                },
            })

            -- Keep lspconfig's cwd = project root: mise picks the ruby from it
            -- and ruby-lsp builds its composed bundle (adds ruby-lsp-rails for
            -- Rails apps) from the Gemfile there. ERB buffers attach too.
            -- reuse_client is upstream's fix: the pinned one ignores the client
            -- name, so a Gemfile-less .rb/.erb was handed to whatever server
            -- was already running (e.g. basedpyright) and ruby-lsp never ran.
            vim.lsp.config("ruby_lsp", {
                cmd = function(dispatchers, config)
                    return vim.lsp.rpc.start(
                        { "mise", "exec", "--", "ruby-lsp" },
                        dispatchers,
                        config and config.root_dir and { cwd = config.root_dir }
                    )
                end,
                reuse_client = function(client, config)
                    return client.name == config.name and client.config.root_dir == config.root_dir
                end,
            })

            -- Python: basedpyright types, ruff lints/formats/sorts imports.
            -- "standard" = plain pyright strictness; a project's pyproject
            -- [tool.basedpyright] / [tool.pyright] still wins. Finds <root>/.venv.
            vim.lsp.config("basedpyright", {
                settings = {
                    basedpyright = {
                        disableOrganizeImports = true,
                        analysis = { typeCheckingMode = "standard" },
                    },
                },
            })
            vim.lsp.config("ruff", {
                -- ruff would pick UTF-8; basedpyright only speaks UTF-16, and
                -- one buffer should not mix encodings
                capabilities = { general = { positionEncodings = { "utf-16" } } },
                on_attach = function(client)
                    client.server_capabilities.hoverProvider = false -- K -> basedpyright
                end,
            })

            -- The pinned nvim-lspconfig forces eslint's legacy
            -- `experimental.useFlatConfig` opt-in when it sees eslint.config.*,
            -- which needs the FlatESLint class ESLint 10 removed (no lint at
            -- all), and sends the root as a path, not a URI. Upstream dropped
            -- both; mirror that so ESLint picks flat/eslintrc itself. Harmless
            -- once lspconfig is updated.
            local eslint_before_init = vim.lsp.config.eslint.before_init
            vim.lsp.config("eslint", {
                before_init = function(params, config)
                    if eslint_before_init then eslint_before_init(params, config) end
                    if config.root_dir then
                        config.settings.experimental = {}
                        config.settings.workspaceFolder = {
                            uri = vim.uri_from_fname(config.root_dir),
                            name = vim.fs.basename(config.root_dir),
                        }
                    end
                end,
            })

            for name, bin in pairs(servers) do
                if vim.fn.executable(bin) == 1 then
                    vim.lsp.enable(name)
                end
            end

            -- Built-in completion instead of nvim-cmp. In LSP buffers the menu
            -- opens as you type ('autocomplete' + the LSP omnifunc, Neovim 0.12)
            -- and on the server's trigger characters (`.`, `->`, `::`).
            -- Accepting applies snippets and auto-imports.
            vim.opt.completeopt = { "menuone", "noselect", "popup" }

            vim.api.nvim_create_autocmd("LspAttach", {
                desc = "Built-in LSP completion",
                callback = function(args)
                    local client = vim.lsp.get_client_by_id(args.data.client_id)
                    if not (client and client:supports_method("textDocument/completion")) then
                        return
                    end
                    vim.lsp.completion.enable(true, client.id, args.buf, { autotrigger = true })
                    if vim.fn.has("nvim-0.12") == 1 then
                        vim.bo[args.buf].complete = "o"
                        vim.bo[args.buf].autocomplete = true
                    end
                end,
            })

            -- <CR> accepts only an item you picked (like cmp's confirm{select=false});
            -- otherwise it's a plain newline. <C-Space> opens the menu by hand.
            vim.keymap.set("i", "<CR>", function()
                if vim.fn.pumvisible() == 1 and vim.fn.complete_info({ "selected" }).selected ~= -1 then
                    return "<C-y>"
                end
                return "<CR>"
            end, { expr = true, desc = "Accept selected completion" })
            vim.keymap.set("i", "<C-Space>", vim.lsp.completion.get, { desc = "LSP completion" })
        end,
    },
}
