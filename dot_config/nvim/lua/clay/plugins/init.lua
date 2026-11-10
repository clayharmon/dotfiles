return {
    {
        "nvim-telescope/telescope.nvim",
        dependencies = {
            "nvim-lua/plenary.nvim",
            { "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
        },
        config = function()
          local telescope = require('telescope')
          local builtin = require('telescope.builtin')

          telescope.setup({
              defaults = {
                  file_ignore_patterns = { "node_modules", ".git/" },
              },
          })

          -- Load fzf extension for better performance
          pcall(telescope.load_extension, 'fzf')

          vim.keymap.set('n', '<leader>pd', builtin.find_files, {})
          vim.keymap.set('n', '<leader>pf', builtin.git_files, {})
          vim.keymap.set('n', '<leader>ps', function()
              builtin.grep_string({ search = vim.fn.input("Grep > ") });
          end)
          vim.keymap.set('n', '<leader>pg', builtin.live_grep, {})
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
    -- nvim-treesitter `main`: it only installs parsers + queries; Neovim does the
    -- highlighting itself. Needs the tree-sitter CLI (pacman: tree-sitter-cli,
    -- brew: tree-sitter-cli) and a C compiler. Does not support lazy-loading.
    {
        "nvim-treesitter/nvim-treesitter",
        branch = "main",
        lazy = false,
        build = ":TSUpdate",
        config = function()
            require('nvim-treesitter').install({
                -- systems
                "c", "make", "go", "gomod", "rust", "toml",
                -- shell / config
                "bash", "fish", "lua", "vim", "vimdoc", "query", "json", "yaml",
                -- web / rails (embedded_template = ERB; html/css are injected into it)
                "ruby", "embedded_template", "html", "css",
                "javascript", "typescript", "tsx", "jsdoc",
                "python",
                -- prose / git
                "markdown", "markdown_inline", "diff", "gitcommit",
            })

            vim.api.nvim_create_autocmd("FileType", {
                callback = function(args)
                    -- no-op for filetypes without an installed parser
                    pcall(vim.treesitter.start, args.buf)
                end,
            })
        end
    },
    {
        "theprimeagen/harpoon",
        config = function()
            local mark = require("harpoon.mark")
            local ui = require("harpoon.ui")

            vim.keymap.set("n", "<leader>a", mark.add_file)
            vim.keymap.set("n", "<C-e>", ui.toggle_quick_menu)

            vim.keymap.set("n", "<leader>h", function() ui.nav_file(1) end)
            vim.keymap.set("n", "<leader>j", function() ui.nav_file(2) end)
            vim.keymap.set("n", "<C-n>", function() ui.nav_file(3) end)
            vim.keymap.set("n", "<C-s>", function() ui.nav_file(4) end)
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
            -- vim.lsp.status() pops the progress ring buffer, so a statusline
            -- polling it blanks between reports. Keep the latest per token.
            local lsp_progress = {}
            vim.api.nvim_create_autocmd("LspProgress", {
                callback = function(ev)
                    local value = ev.data.params.value
                    if type(value) ~= "table" then return end
                    local key = ev.data.client_id .. ":" .. tostring(ev.data.params.token)
                    if value.kind == "end" then
                        lsp_progress[key] = nil
                    else
                        local entry = lsp_progress[key] or {}
                        entry.title = value.title or entry.title
                        entry.message = value.message
                        entry.percentage = value.percentage
                        lsp_progress[key] = entry
                    end
                    require('lualine').refresh({ place = { 'statusline' } })
                end,
            })

            local function lsp_progress_status()
                local parts = {}
                for _, p in pairs(lsp_progress) do
                    local detail = p.percentage and (p.percentage .. "%") or p.message
                    parts[#parts + 1] = detail and ((p.title or "") .. " " .. detail) or (p.title or "")
                end
                table.sort(parts)
                -- lualine passes this through as statusline syntax: a bare % is E539
                return (table.concat(parts, " | "):gsub("%%", "%%%%"))
            end

            require('lualine').setup({
                options = {
                    theme = 'dracula-nvim'
                },
                sections = {
                    lualine_x = { lsp_progress_status, 'encoding', 'fileformat', 'filetype' },
                },
            })
        end
    },
    {
        'MeanderingProgrammer/render-markdown.nvim',
        dependencies = { 'nvim-treesitter/nvim-treesitter', 'nvim-tree/nvim-web-devicons' },
        opts = {},
    },
    -- Modern file explorer (Primeagen & TJ recommended)
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
    -- Git signs in the gutter
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
    -- Auto-detect indentation (simple and useful)
    {
        'tpope/vim-sleuth',
    },
    -- AI chat/inline edits through Claude Code
    {
        "olimorris/codecompanion.nvim",
        dependencies = {
            "nvim-lua/plenary.nvim",
            "nvim-treesitter/nvim-treesitter",
            "nvim-telescope/telescope.nvim",
        },
       config = function()
            local use_bedrock = os.getenv("CLAUDE_CODE_USE_BEDROCK")

            -- Build adapter config based on environment
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
