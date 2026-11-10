-- Hyprland Lua config (0.57+), ported from the old hyprland.conf (0.55).
-- Wiki: https://wiki.hypr.land/configuring/

------------------
---- MONITORS ----
------------------

-- Gigabyte M27U on the dock (driven by the NVIDIA GF108). Matched by
-- description so it works on any dock DP port.
local dockMonitor = "desc:GIGA-BYTE TECHNOLOGY CO. LTD. M27U 23463B000013"

-- Clamshell mode: lid closed + an external display connected -> laptop panel
-- off, so everything moves to the external monitor. The lid-switch binds
-- (KEYBINDINGS) reload this config, so this is re-evaluated on every
-- open/close. Undocked, the panel is never disabled.
local function lidClosed()
    local f = io.open("/proc/acpi/button/lid/LID/state", "r")
    if not f then return false end
    local s = f:read("a") or ""
    f:close()
    return s:find("closed") ~= nil
end

local function externalDisplayConnected()
    local ok, found = pcall(function()
        local p = io.popen([[for c in /sys/class/drm/card*-*; do
            case "$c" in *LVDS*|*eDP*) ;; *) cat "$c/status" ;; esac
        done 2>/dev/null]])
        if not p then return false end
        local out = p:read("a") or ""
        p:close()
        for line in out:gmatch("[^\n]+") do
            if line == "connected" then return true end
        end
        return false
    end)
    return ok and found
end

local clamshell = lidClosed() and externalDisplayConnected()

hl.monitor({
    output   = dockMonitor,
    -- 2560x1440@59.95 from the M27U's EDID (CTA block DTD). nouveau prunes it
    -- from the probed mode list, so it's forced as a modeline.
    -- Known-good fallback: mode = "1920x1080@60.00"
    mode     = "modeline 241.50 2560 2608 2640 2720 1440 1443 1448 1481 +hsync -vsync",
    position = "auto",
    scale    = 1.25, -- 2048x1152 logical; 1.333333 gives 1920x1080 if you want bigger
    -- Wide-gamut panel (~128% of sRGB). The monitor's OSD is set to its sRGB
    -- mode, which clamps the gamut in hardware. If you go back to Standard
    -- mode, re-enable software mapping with: cm = "edid",
})

-- Laptop panel (FHD mod).
hl.monitor({
    output   = "LVDS-1",
    mode     = "preferred",
    position = "auto",
    scale    = 1.333333,
    disabled = clamshell,
})

-- Anything else (projectors, random monitors).
hl.monitor({
    output   = "",
    mode     = "preferred",
    position = "auto",
    scale    = 1.333333,
})


---------------------
---- MY PROGRAMS ----
---------------------

local terminal = "kitty"
local menu     = "fuzzel"
local editor   = "nvim"
local browser  = "firefox-developer-edition"
local lock     = "pidof hyprlock || hyprlock"


-------------------
---- AUTOSTART ----
-------------------

hl.on("hyprland.start", function()
    hl.exec_cmd("hyprpaper")
    hl.exec_cmd("waybar")
    hl.exec_cmd("hypridle") -- idle lock/dim/dpms; config in hypridle.conf
    -- mako (notifications) is D-Bus activated, no autostart needed
end)


-------------------------------
---- ENVIRONMENT VARIABLES ----
-------------------------------

hl.env("XCURSOR_SIZE", "24")
hl.env("HYPRCURSOR_SIZE", "24")
-- Intel renders; NVIDIA (GF108) only drives the dock's DP outputs.
-- Stable names come from /etc/udev/rules.d/70-gpu-names.rules; dgpu is absent when undocked.
hl.env("AQ_DRM_DEVICES", "/dev/dri/igpu:/dev/dri/dgpu")


-----------------------
---- LOOK AND FEEL ----
-----------------------

hl.config({
    general = {
        -- Sharp look: square corners, small even gaps so the wallpaper frames the tiles
        gaps_in  = 4,
        gaps_out = 8,

        border_size = 2,

        col = {
            -- Dracula purple -> green. Static on purpose: an animated (looping)
            -- gradient redraws every frame, which costs battery and heat.
            active_border   = { colors = { "rgba(bd93f9ee)", "rgba(50fa7bee)" }, angle = 45 },
            inactive_border = "rgba(44475aaa)",
        },

        resize_on_border = true,
        allow_tearing    = false,
        layout           = "dwindle",
    },

    decoration = {
        rounding       = 0,
        rounding_power = 1, -- min is 1 in 0.57; no effect since rounding = 0

        active_opacity   = 1.0,
        inactive_opacity = 1.0,

        shadow = {
            enabled      = false,
            range        = 4,
            render_power = 3,
            color        = "rgba(1a1a1aee)",
        },

        -- Frosted glass behind anything transparent (kitty at 0.8, waybar, fuzzel).
        -- new_optimizations caches the blurred wallpaper, so the cost stays low on the HD 4000.
        blur = {
            enabled           = true,
            size              = 6,
            passes            = 2,
            vibrancy          = 0.1696,
            new_optimizations = true,
        },
    },

    animations = {
        enabled = true,
    },

    dwindle = {
        preserve_split = true,
    },

    master = {
        new_status = "master",
    },

    misc = {
        force_default_wallpaper  = 0,
        disable_hyprland_logo    = true,
        disable_splash_rendering = true,
        vrr                      = 0,
        -- if hyprlock ever crashes while locked, relaunch it from a TTY with:
        --   hyprctl --instance 0 dispatch 'hl.dsp.exec_cmd("hyprlock")'
        allow_session_lock_restore = true,
    },

    input = {
        kb_layout  = "us",
        kb_variant = "",
        kb_model   = "",
        kb_options = "",
        kb_rules   = "",

        follow_mouse = 1,

        sensitivity  = 0,
        repeat_rate  = 40,
        repeat_delay = 225,

        touchpad = {
            natural_scroll = false,
        },
    },

    ecosystem = {
        no_update_news = true,
    },
    cursor = {
        -- HW cursor flickers on the nouveau (secondary GPU) output; draw it in software.
        no_hardware_cursors = true,
    },
})

-- Curves and animations (same as old config)
hl.curve("easeOutQuint",   { type = "bezier", points = { {0.23, 1},    {0.32, 1} } })
hl.curve("easeInOutCubic", { type = "bezier", points = { {0.65, 0.05}, {0.36, 1} } })
hl.curve("linear",         { type = "bezier", points = { {0, 0},       {1, 1}    } })
hl.curve("almostLinear",   { type = "bezier", points = { {0.5, 0.5},   {0.75, 1} } })
hl.curve("quick",          { type = "bezier", points = { {0.15, 0},    {0.1, 1}  } })

hl.animation({ leaf = "global",        enabled = true, speed = 10,   bezier = "default" })
hl.animation({ leaf = "border",        enabled = true, speed = 5.39, bezier = "easeOutQuint" })
hl.animation({ leaf = "windows",       enabled = true, speed = 4.79, bezier = "easeOutQuint" })
hl.animation({ leaf = "windowsIn",     enabled = true, speed = 4.1,  bezier = "easeOutQuint", style = "popin 87%" })
hl.animation({ leaf = "windowsOut",    enabled = true, speed = 1.49, bezier = "linear",       style = "popin 87%" })
hl.animation({ leaf = "fadeIn",        enabled = true, speed = 1.73, bezier = "almostLinear" })
hl.animation({ leaf = "fadeOut",       enabled = true, speed = 1.46, bezier = "almostLinear" })
hl.animation({ leaf = "fade",          enabled = true, speed = 3.03, bezier = "quick" })
hl.animation({ leaf = "layers",        enabled = true, speed = 3.81, bezier = "easeOutQuint" })
hl.animation({ leaf = "layersIn",      enabled = true, speed = 4,    bezier = "easeOutQuint", style = "fade" })
hl.animation({ leaf = "layersOut",     enabled = true, speed = 1.5,  bezier = "linear",       style = "fade" })
hl.animation({ leaf = "fadeLayersIn",  enabled = true, speed = 1.79, bezier = "almostLinear" })
hl.animation({ leaf = "fadeLayersOut", enabled = true, speed = 1.39, bezier = "almostLinear" })
hl.animation({ leaf = "workspaces",    enabled = true, speed = 1.94, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "workspacesIn",  enabled = true, speed = 1.21, bezier = "almostLinear", style = "fade" })
hl.animation({ leaf = "workspacesOut", enabled = true, speed = 1.94, bezier = "almostLinear", style = "fade" })

-- Per-device config
hl.device({
    name        = "epic-mouse-v1",
    sensitivity = -0.5,
})


---------------------
---- KEYBINDINGS ----
---------------------

local mainMod = "ALT"

hl.bind(mainMod .. " + RETURN", hl.dsp.exec_cmd(terminal))
hl.bind(mainMod .. " + C",      hl.dsp.window.close())
hl.bind(mainMod .. " + M",      hl.dsp.exit())
hl.bind(mainMod .. " + E",      hl.dsp.exec_cmd(terminal .. " " .. editor .. " ."))
hl.bind(mainMod .. " + B",      hl.dsp.exec_cmd(browser))
hl.bind(mainMod .. " + R",      hl.dsp.exec_cmd(menu))
hl.bind(mainMod .. " + P",      hl.dsp.window.pseudo())
hl.bind(mainMod .. " + F",      hl.dsp.window.fullscreen())
hl.bind(mainMod .. " + ESCAPE", hl.dsp.exec_cmd(lock))

-- Screenshot
hl.bind(mainMod .. " + F2", hl.dsp.exec_cmd('grim -g "$(slurp)" - | wl-copy'))

-- Move focus with vim motions
hl.bind(mainMod .. " + H", hl.dsp.focus({ direction = "left" }))
hl.bind(mainMod .. " + L", hl.dsp.focus({ direction = "right" }))
hl.bind(mainMod .. " + K", hl.dsp.focus({ direction = "up" }))
hl.bind(mainMod .. " + J", hl.dsp.focus({ direction = "down" }))

-- Workspaces 1-10 (key 0 = workspace 10)
for i = 1, 10 do
    local key = i % 10
    hl.bind(mainMod .. " + " .. key,         hl.dsp.focus({ workspace = i }))
    hl.bind(mainMod .. " + SHIFT + " .. key, hl.dsp.window.move({ workspace = i }))
end

-- Special workspace (scratchpad)
hl.bind(mainMod .. " + S",         hl.dsp.workspace.toggle_special("magic"))
hl.bind(mainMod .. " + SHIFT + S", hl.dsp.window.move({ workspace = "special:magic" }))

-- Scroll through existing workspaces
hl.bind(mainMod .. " + mouse_down", hl.dsp.focus({ workspace = "e+1" }))
hl.bind(mainMod .. " + mouse_up",   hl.dsp.focus({ workspace = "e-1" }))

-- Move/resize windows by holding mainMod + Z / X
hl.bind(mainMod .. " + Z", hl.dsp.window.drag(),   { mouse = true })
hl.bind(mainMod .. " + X", hl.dsp.window.resize(), { mouse = true })

-- Multimedia keys for volume and brightness
hl.bind("XF86AudioRaiseVolume",  hl.dsp.exec_cmd("wpctl set-volume -l 1 @DEFAULT_AUDIO_SINK@ 5%+"), { locked = true, repeating = true })
hl.bind("XF86AudioLowerVolume",  hl.dsp.exec_cmd("wpctl set-volume @DEFAULT_AUDIO_SINK@ 5%-"),      { locked = true, repeating = true })
hl.bind("XF86AudioMute",         hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SINK@ toggle"),     { locked = true, repeating = true })
hl.bind("XF86AudioMicMute",      hl.dsp.exec_cmd("wpctl set-mute @DEFAULT_AUDIO_SOURCE@ toggle"),   { locked = true, repeating = true })
hl.bind("XF86MonBrightnessUp",   hl.dsp.exec_cmd("brightnessctl s 10%+"),                           { locked = true, repeating = true })
hl.bind("XF86MonBrightnessDown", hl.dsp.exec_cmd("brightnessctl s 10%-"),                           { locked = true, repeating = true })

-- Lid open/close: reload the config so the clamshell check (MONITORS) re-runs
hl.bind("switch:on:Lid Switch",  hl.dsp.reload_config(), { locked = true })
hl.bind("switch:off:Lid Switch", hl.dsp.reload_config(), { locked = true })

-- Requires playerctl
hl.bind("XF86AudioNext",  hl.dsp.exec_cmd("playerctl next"),       { locked = true })
hl.bind("XF86AudioPause", hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioPlay",  hl.dsp.exec_cmd("playerctl play-pause"), { locked = true })
hl.bind("XF86AudioPrev",  hl.dsp.exec_cmd("playerctl previous"),   { locked = true })


--------------------------------
---- WINDOWS AND WORKSPACES ----
--------------------------------

-- Blur behind the bar and the launcher; ignore_alpha keeps fully clear pixels unblurred.
hl.layer_rule({ name = "blur-waybar", match = { namespace = "^waybar$" },   blur = true, ignore_alpha = 0.1 })
hl.layer_rule({ name = "blur-fuzzel", match = { namespace = "^launcher$" }, blur = true, ignore_alpha = 0.1 })

hl.window_rule({
    -- Ignore maximize requests from apps
    name  = "suppress-maximize-events",
    match = { class = ".*" },
    suppress_event = "maximize",
})

hl.window_rule({
    -- Fix some dragging issues with XWayland
    name  = "fix-xwayland-drags",
    match = {
        class      = "^$",
        title      = "^$",
        xwayland   = true,
        float      = true,
        fullscreen = false,
        pin        = false,
    },
    no_focus = true,
})

-- Workspaces 1-5 on the laptop panel, 6-10 on the dock monitor (6 is its
-- default). Undocked, everything just lands on the laptop.
for i = 1, 10 do
    hl.workspace_rule({
        workspace = tostring(i),
        monitor   = i <= 5 and "LVDS-1" or dockMonitor,
        default   = (i == 1 or i == 6),
    })
end
