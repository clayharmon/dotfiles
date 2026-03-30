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
        build = ":TSUpdate",
        config = function()
            require('nvim-treesitter.configs').setup({
                ensure_installed = { "ruby", "javascript", "typescript", "c", "lua", "vim", "vimdoc", "rust", "nix" },
                sync_install = false,
                auto_install = true,

                highlight = {
                    enable = true,
                    additional_vim_regex_highlighting = false,
                },
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
    {
        'MeanderingProgrammer/render-markdown.nvim',
        dependencies = { 'nvim-treesitter/nvim-treesitter', 'nvim-tree/nvim-web-devicons' },
        opts = {},
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

    -- Claude Code <-> Neovim integration (WebSocket protocol, same as VS Code extension)
    {
        "coder/claudecode.nvim",
        opts = {
            terminal = {
                split_side = "right",
                split_width_percentage = 0.4,
            },
        },
        keys = {
            { "<leader>ac", "<cmd>ClaudeCode<cr>", desc = "Toggle Claude Code" },
            { "<leader>aB", "<cmd>ClaudeCode --dangerously-skip-permissions<cr>", desc = "Claude Code (bypass perms)" },
            { "<leader>af", "<cmd>ClaudeCodeFocus<cr>", desc = "Focus Claude" },
            { "<leader>ar", "<cmd>ClaudeCode --resume<cr>", desc = "Resume session" },
            { "<leader>aC", "<cmd>ClaudeCode --continue<cr>", desc = "Continue last session" },
            { "<leader>as", "<cmd>ClaudeCodeSend<cr>", mode = "v", desc = "Send selection to Claude" },
            { "<leader>ab", "<cmd>ClaudeCodeAdd %<cr>", desc = "Add buffer to context" },
        },
    },

    -- CodeCompanion (inline AI chat/edits)
    {
        "olimorris/codecompanion.nvim",
        dependencies = {
            "nvim-lua/plenary.nvim",
            "nvim-treesitter/nvim-treesitter",
        },
       config = function()
            local use_bedrock = os.getenv("CLAUDE_CODE_USE_BEDROCK")

            local adapter_config = {}
            if not use_bedrock then
                adapter_config.env = {
                    CLAUDE_CODE_OAUTH_TOKEN = os.getenv("CLAUDE_CODE_OAUTH_TOKEN")
                }
            end

            require("codecompanion").setup({
                version = "v17.33.0",
                ignore_warnings = true,
                adapters = {
                    http = {
                        claude_code = function()
                            return require("codecompanion.adapters").extend("claude_code", adapter_config)
                        end,
                    }
                },
                strategies = {
                    chat = {
                        adapter = "claude_code",
                    },
                    inline = {
                        adapter = "claude_code",
                    },
                },
            })
            vim.keymap.set("n", "<leader>cc", "<cmd>CodeCompanionChat Toggle<cr>")
            vim.keymap.set("v", "<leader>cc", "<cmd>CodeCompanionChat Toggle<cr>")
        end,
    },
}
