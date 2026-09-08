return {
    -- Fuzzy finder (replaces telescope -- faster, less overhead)
    {
        "ibhagwan/fzf-lua",
        dependencies = { "nvim-tree/nvim-web-devicons" },
        config = function()
            local fzf = require('fzf-lua')
            fzf.setup({
                winopts = {
                    preview = { default = "bat" },
                },
                files = {
                    fd_opts = "--type f --hidden --follow --exclude .git --exclude node_modules",
                },
            })

            vim.keymap.set('n', '<leader>pd', fzf.files, {})
            vim.keymap.set('n', '<leader>pf', fzf.git_files, {})
            vim.keymap.set('n', '<leader>ps', fzf.grep, {})
            vim.keymap.set('n', '<leader>pg', fzf.live_grep, {})
            vim.keymap.set('n', '<leader>pb', fzf.buffers, {})
            vim.keymap.set('n', '<leader>ph', fzf.helptags, {})
            vim.keymap.set('n', '<leader>pe', fzf.diagnostics_workspace, {})
        end
    },
    {
        "Mofiqul/dracula.nvim",
        priority = 1000,
        config = function()
            require('dracula').setup({
                transparent_bg = true
            })
            vim.cmd.colorscheme("dracula")
        end
    },
    {
        "nvim-treesitter/nvim-treesitter",
        branch = "main",
        lazy = false,
        build = ":TSUpdate",
        config = function()
            require('nvim-treesitter').setup({})
            require('nvim-treesitter').install({
                "ruby", "javascript", "typescript", "c", "lua", "vim",
                "vimdoc", "rust", "nix", "markdown", "markdown_inline",
                "json", "yaml", "toml", "html", "css", "bash", "fish",
            })

            vim.api.nvim_create_autocmd('FileType', {
                callback = function(args)
                    pcall(vim.treesitter.start, args.buf)
                end,
            })
        end
    },
    -- Harpoon 2 (rewritten by ThePrimeagen)
    {
        "ThePrimeagen/harpoon",
        branch = "harpoon2",
        dependencies = { "nvim-lua/plenary.nvim" },
        config = function()
            local harpoon = require("harpoon")
            harpoon:setup()

            vim.keymap.set("n", "<leader>a", function() harpoon:list():add() end)
            vim.keymap.set("n", "<C-e>", function() harpoon.ui:toggle_quick_menu(harpoon:list()) end)

            vim.keymap.set("n", "<leader>h", function() harpoon:list():select(1) end)
            vim.keymap.set("n", "<leader>j", function() harpoon:list():select(2) end)
            vim.keymap.set("n", "<C-n>", function() harpoon:list():select(3) end)
            vim.keymap.set("n", "<C-s>", function() harpoon:list():select(4) end)
        end
    },
    {
        "tpope/vim-fugitive",
        config = function()
            vim.keymap.set("n", "<leader>gs", "<cmd>vertical Git<cr>");
        end
    },
    {
        'nvim-lualine/lualine.nvim',
        dependencies = { 'nvim-tree/nvim-web-devicons' },
        config = function()
            require('lualine').setup({
                options = {
                    theme = 'dracula-nvim'
                }
            })
        end
    },
    -- Markdown rendered in the buffer. Replaces markdown-preview.nvim (needed
    -- npm) and the glow popup (needed tmux). Toggle with <leader>mp.
    {
        'MeanderingProgrammer/render-markdown.nvim',
        ft = { 'markdown' },
        dependencies = { 'nvim-treesitter/nvim-treesitter', 'nvim-tree/nvim-web-devicons' },
        opts = {},
        keys = {
            { '<leader>mp', '<cmd>RenderMarkdown toggle<cr>', desc = 'Toggle markdown rendering' },
        },
    },
    {
        'stevearc/oil.nvim',
        dependencies = { 'nvim-tree/nvim-web-devicons' },
        config = function()
            require('oil').setup({
                default_file_explorer = true,
                view_options = {
                    show_hidden = true,
                },
            })
            vim.keymap.set("n", "-", "<CMD>Oil<CR>", { desc = "Open parent directory" })
        end
    },
    {
        'mbbill/undotree',
        config = function()
            vim.keymap.set("n", "<leader>u", vim.cmd.UndotreeToggle)
        end
    },
    {
        'lewis6991/gitsigns.nvim',
        opts = {
            signs = {
                add = { text = '+' },
                change = { text = '~' },
                delete = { text = '_' },
                topdelete = { text = '‾' },
                changedelete = { text = '~' },
            },
        },
    },
    {
        'tpope/vim-sleuth',
    },
}
