-- No plugins here need remote-plugin hosts; skip probing for them at startup.
vim.g.loaded_node_provider = 0
vim.g.loaded_perl_provider = 0
vim.g.loaded_python3_provider = 0
vim.g.loaded_ruby_provider = 0

require("clay.set")
require("clay.remap")

local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.uv.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable", -- latest stable release
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup("clay.plugins")

-- Built-in undotree (Neovim 0.12+), loaded after lazy so its rtp reset keeps it.
if pcall(vim.cmd.packadd, "nvim.undotree") then
    vim.keymap.set("n", "<leader>u", function() require("undotree").open() end)
end

vim.filetype.add({
    extension = {
        mdx = "mdx",
    },
})
vim.treesitter.language.register("markdown", "mdx")
