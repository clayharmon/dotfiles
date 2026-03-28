return {
    -- nvim-lspconfig provides default configs (cmd, filetypes, root_markers)
    -- for ~389 servers via lsp/*.lua files on the runtimepath.
    -- We DON'T call require('lspconfig') -- just need it installed.
    { "neovim/nvim-lspconfig" },

    -- Mason (manages LSP binary installs)
    { "mason-org/mason.nvim", opts = {} },
    {
        "mason-org/mason-lspconfig.nvim",
        dependencies = {
            "mason-org/mason.nvim",
            "neovim/nvim-lspconfig",
        },
        opts = {
            ensure_installed = { "ts_ls", "lua_ls", "rust_analyzer" },
            -- Automatically calls vim.lsp.enable() for Mason-installed servers
            automatic_enable = true,
        },
    },

    -- Lua LSP support for neovim config editing
    {
        "folke/lazydev.nvim",
        ft = "lua",
        opts = {},
    },

    -- Completion (replaces nvim-cmp -- written in Rust, much faster)
    {
        "saghen/blink.cmp",
        version = "1.*",
        dependencies = { "folke/lazydev.nvim" },
        opts = {
            keymap = {
                preset = "default",
                ["<CR>"] = { "accept", "fallback" },
                ["<C-Space>"] = { "show", "show_documentation", "hide_documentation" },
                ["<C-n>"] = { "select_next", "fallback" },
                ["<C-p>"] = { "select_prev", "fallback" },
                ["<C-d>"] = { "scroll_documentation_down", "fallback" },
                ["<C-u>"] = { "scroll_documentation_up", "fallback" },
            },
            appearance = {
                nerd_font_variant = "mono",
            },
            sources = {
                default = { "lazydev", "lsp", "path", "buffer" },
                providers = {
                    lazydev = {
                        name = "LazyDev",
                        module = "lazydev.integrations.blink",
                        score_offset = 100,
                    },
                },
            },
            completion = {
                documentation = { auto_show = true },
            },
        },
    },
}
