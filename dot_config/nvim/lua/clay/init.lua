require("clay.set")
require("clay.remap")

local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.uv.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable",
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup("clay.plugins")

-- Add Mason bin to PATH so vim.lsp can find installed servers
vim.env.PATH = vim.fn.stdpath("data") .. "/mason/bin:" .. vim.env.PATH

-- LSP overrides (nvim-lspconfig provides the defaults via lsp/*.lua,
-- mason-lspconfig calls vim.lsp.enable() automatically)
local capabilities = require("blink.cmp").get_lsp_capabilities()

-- Apply blink capabilities to all servers
vim.lsp.config("*", { capabilities = capabilities })

-- ruby_lsp comes from Mason (mason/bin is on PATH above). mise exec picks the
-- Ruby that .ruby-version or mise.toml names for the project.
vim.lsp.config("ruby_lsp", {
    cmd = { "mise", "exec", "--", "ruby-lsp" },
})
vim.lsp.enable("ruby_lsp")

vim.filetype.add({
    extension = {
        mdx = "mdx",
    },
    pattern = {
        -- chezmoi templates: highlight based on inner file type
        [".*%.sh%.tmpl"] = "bash",
        [".*%.rb%.tmpl"] = "ruby",
        [".*%.fish%.tmpl"] = "fish",
        [".*%.toml%.tmpl"] = "toml",
        [".*%.conf%.tmpl"] = "conf",
    },
})
vim.treesitter.language.register("markdown", "mdx")
