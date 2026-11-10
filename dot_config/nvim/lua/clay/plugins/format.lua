-- <F3> formats the buffer (or the visual selection). conform.nvim is only here
-- for Prettier, which has no language server: it runs when the project has a
-- Prettier config and its own node_modules/.bin/prettier. Everything else
-- falls back to LSP formatting (ruff for Python, ruby-lsp -> RuboCop for Ruby,
-- ts_ls/eslint for JS/TS without Prettier, clangd/gopls/rust-analyzer, ...).
local prettier_fts = {
    "javascript", "javascriptreact", "typescript", "typescriptreact",
    "json", "jsonc", "css", "scss", "html", "yaml", "markdown",
}

return {
    {
        "stevearc/conform.nvim",
        keys = {
            {
                "<F3>",
                function() require("conform").format({ async = true, lsp_format = "fallback" }) end,
                mode = { "n", "x" },
                desc = "Format buffer",
            },
        },
        opts = function()
            local by_ft = {}
            for _, ft in ipairs(prettier_fts) do
                by_ft[ft] = { "prettier" }
            end
            return {
                formatters_by_ft = by_ft,
                formatters = {
                    -- No Prettier config in the project -> skip it (LSP fallback).
                    prettier = { require_cwd = true },
                },
            }
        end,
    },
}
