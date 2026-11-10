vim.opt.guicursor = ""

vim.opt.nu = true
vim.opt.relativenumber = true

vim.opt.tabstop = 2
vim.opt.softtabstop = 2
vim.opt.shiftwidth = 2
vim.opt.expandtab = true

vim.opt.smartindent = true
vim.opt.wrap = false

vim.opt.swapfile = false
vim.opt.backup = false
vim.opt.undodir = os.getenv("HOME") .. "/.vim/undodir"
vim.opt.undofile = true

vim.opt.hlsearch = false
vim.opt.incsearch = true

vim.opt.termguicolors = true
vim.opt.background = "dark"

vim.opt.scrolloff = 8
vim.opt.signcolumn = "yes"

vim.opt.updatetime = 50
vim.opt.colorcolumn = "80"

vim.api.nvim_create_autocmd("FileType", {
    pattern = "markdown",
    callback = function()
        vim.opt_local.textwidth = 80
        vim.opt_local.formatoptions:append("t")
    end,
})

-- Open binary files externally and return to Oil
local is_mac = vim.fn.has("macunix") == 1

local function open_externally(file, cmd)
    local dir = vim.fn.fnamemodify(file, ":h")
    vim.fn.jobstart(cmd, { detach = true })
    vim.cmd("bwipeout")
    require("oil").open(dir)
end

vim.api.nvim_create_autocmd("BufReadCmd", {
    pattern = { "*.png", "*.jpg", "*.jpeg", "*.gif", "*.bmp", "*.webp" },
    callback = function(ev)
        local cmd = is_mac and { "open", ev.file } or { "nsxiv", ev.file }
        open_externally(ev.file, cmd)
    end,
})

vim.api.nvim_create_autocmd("BufReadCmd", {
    pattern = "*.pdf",
    callback = function(ev)
        local cmd = is_mac and { "open", ev.file } or { "zathura", ev.file }
        open_externally(ev.file, cmd)
    end,
})
