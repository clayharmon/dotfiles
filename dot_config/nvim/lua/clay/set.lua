vim.opt.guicursor = ""

vim.opt.nu = true
vim.opt.relativenumber = true

vim.opt.tabstop = 2
vim.opt.softtabstop = 2
vim.opt.shiftwidth = 2
vim.opt.expandtab = true

vim.opt.smartindent = true
vim.opt.wrap = false

-- Undo history persists in stdpath("state")/undo, the default location.
vim.opt.swapfile = false
vim.opt.backup = false
vim.opt.undofile = true

vim.opt.hlsearch = false
vim.opt.incsearch = true

vim.opt.termguicolors = true
vim.opt.background = "dark"

vim.opt.scrolloff = 8
vim.opt.signcolumn = "yes"

vim.opt.updatetime = 50
vim.opt.colorcolumn = "80"

-- Rounded borders on hover, signature help and other floats (0.11+).
vim.o.winborder = "rounded"

-- Neovim 0.11 turned inline diagnostics off by default.
vim.diagnostic.config({
  virtual_text = true,
  severity_sort = true,
})

-- Agents edit files on disk while they are open here. Pick the change up as
-- soon as the window or buffer gets focus instead of waiting for :e.
vim.api.nvim_create_autocmd({ "FocusGained", "BufEnter", "CursorHold", "TermClose", "TermLeave" }, {
  desc = "Reload buffers changed outside Neovim",
  callback = function()
    if vim.fn.mode() ~= "c" and vim.fn.getcmdwintype() == "" then
      vim.cmd("checktime")
    end
  end,
})
