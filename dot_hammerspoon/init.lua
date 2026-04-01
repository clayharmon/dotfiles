-- Dracula app launcher (top right, auto-height)
-- opt+space to toggle, esc to close, enter to launch

local colors = {
  bg        = { hex = "#282a36" },
  fg        = { hex = "#f8f8f2" },
  comment   = { hex = "#6272a4" },
  purple    = { hex = "#bd93f9" },
  green     = { hex = "#50fa7b" },
  selection = { hex = "#44475a" },
}

local FONT        = "JetBrainsMono Nerd Font"
local FONT_SIZE   = 14
local WIDTH        = 400
local ROW_HEIGHT   = 24
local MAX_ROWS     = 15
local PADDING      = 10
local PROMPT_HEIGHT = 24
local TOP_OFFSET   = 28

local canvas       = nil
local typedWatcher = nil
local clickWatcher = nil
local query        = ""
local filtered     = {}
local selectedIdx  = 1
local isVisible    = false
local appCache     = nil

---------------------------------------------------------------------------
-- Fuzzy match
---------------------------------------------------------------------------
local function fuzzyMatch(str, pattern)
  local pIdx = 1
  local score = 0
  local lastMatch = 0
  str = str:lower()
  pattern = pattern:lower()
  for i = 1, #str do
    if pIdx <= #pattern and str:sub(i, i) == pattern:sub(pIdx, pIdx) then
      if i == lastMatch + 1 then score = score + 10 end
      if i == 1 or str:sub(i - 1, i - 1):match("[/%.%- _]") then score = score + 5 end
      score = score + 1
      lastMatch = i
      pIdx = pIdx + 1
    end
  end
  if pIdx > #pattern then return true, score end
  return false, 0
end

---------------------------------------------------------------------------
-- Apps
---------------------------------------------------------------------------
local function loadApps()
  if appCache then return appCache end
  appCache = {}
  local seen = {}
  local dirs = {
    "/Applications",
    "/Applications/Utilities",
    "/System/Applications",
    "/System/Applications/Utilities",
    "/System/Library/CoreServices",
  }
  for _, dir in ipairs(dirs) do
    local iter, data = hs.fs.dir(dir)
    if iter then
      for file in iter, data do
        if file:match("%.app$") and not file:match("^%.") then
          local name = file:gsub("%.app$", "")
          if not seen[name] then
            seen[name] = true
            table.insert(appCache, {
              label = name,
              action = function() hs.application.launchOrFocus(name) end,
            })
          end
        end
      end
    end
  end
  table.sort(appCache, function(a, b) return a.label:lower() < b.label:lower() end)
  return appCache
end

---------------------------------------------------------------------------
-- Filter
---------------------------------------------------------------------------
local function updateFiltered()
  local q = query
  if q == "" then
    filtered = loadApps()
  else
    local scored = {}
    for _, app in ipairs(loadApps()) do
      local match, score = fuzzyMatch(app.label, q)
      if match then
        table.insert(scored, { entry = app, score = score })
      end
    end
    table.sort(scored, function(a, b) return a.score > b.score end)
    filtered = {}
    for _, s in ipairs(scored) do table.insert(filtered, s.entry) end
  end
  selectedIdx = 1
  draw()
end

---------------------------------------------------------------------------
-- Draw
---------------------------------------------------------------------------
function draw()
  if canvas then canvas:delete() end

  local screen = hs.screen.mainScreen():frame()
  local visibleRows = math.min(#filtered, MAX_ROWS)
  local totalHeight = PADDING + PROMPT_HEIGHT + 6 + (visibleRows * ROW_HEIGHT) + PADDING
  local x = screen.x + screen.w - WIDTH - 8
  local y = screen.y + TOP_OFFSET

  canvas = hs.canvas.new({ x = x, y = y, w = WIDTH, h = totalHeight })
  canvas:behavior(hs.canvas.windowBehaviors.canJoinAllSpaces)
  canvas:level(hs.canvas.windowLevels.modalPanel)

  -- Background
  canvas:appendElements({
    type = "rectangle",
    action = "fill",
    roundedRectRadii = { xRadius = 8, yRadius = 8 },
    fillColor = colors.bg,
    frame = { x = 0, y = 0, w = WIDTH, h = totalHeight },
  })

  -- Border
  canvas:appendElements({
    type = "rectangle",
    action = "stroke",
    roundedRectRadii = { xRadius = 8, yRadius = 8 },
    strokeColor = colors.purple,
    strokeWidth = 1,
    frame = { x = 0, y = 0, w = WIDTH, h = totalHeight },
  })

  -- Prompt slash
  canvas:appendElements({
    type = "text",
    text = "/",
    textColor = colors.purple,
    textFont = FONT,
    textSize = FONT_SIZE,
    frame = { x = PADDING, y = PADDING, w = 14, h = PROMPT_HEIGHT },
  })

  -- Prompt query
  canvas:appendElements({
    type = "text",
    text = query .. "█",
    textColor = colors.green,
    textFont = FONT,
    textSize = FONT_SIZE,
    frame = { x = PADDING + 14, y = PADDING, w = WIDTH - PADDING * 2 - 14, h = PROMPT_HEIGHT },
  })

  -- Results
  local startY = PADDING + PROMPT_HEIGHT + 6

  for i = 1, visibleRows do
    local entry = filtered[i]
    local rowY = startY + (i - 1) * ROW_HEIGHT
    local isSelected = (i == selectedIdx)

    if isSelected then
      canvas:appendElements({
        type = "rectangle",
        action = "fill",
        fillColor = colors.selection,
        frame = { x = 4, y = rowY, w = WIDTH - 8, h = ROW_HEIGHT },
      })
    end

    canvas:appendElements({
      type = "text",
      text = entry.label,
      textColor = isSelected and colors.fg or colors.comment,
      textFont = FONT,
      textSize = FONT_SIZE,
      frame = { x = PADDING + 4, y = rowY + 3, w = WIDTH - PADDING * 2 - 4, h = FONT_SIZE + 4 },
    })
  end

  canvas:show()
end

---------------------------------------------------------------------------
-- Actions
---------------------------------------------------------------------------
local function launch()
  local action = filtered[selectedIdx] and filtered[selectedIdx].action
  hide()
  if action then
    hs.timer.doAfter(0.01, action)
  end
end

function hide()
  if canvas then canvas:delete(); canvas = nil end
  if typedWatcher then typedWatcher:stop(); typedWatcher = nil end
  if clickWatcher then clickWatcher:stop(); clickWatcher = nil end
  isVisible = false
  query = ""
  selectedIdx = 1
end

local function show()
  loadApps()
  query = ""
  selectedIdx = 1
  filtered = loadApps()
  draw()
  isVisible = true

  clickWatcher = hs.eventtap.new({ hs.eventtap.event.types.leftMouseDown }, function(event)
    local pos = event:location()
    local screen = hs.screen.mainScreen():frame()
    local panelX = screen.x + screen.w - WIDTH - 8
    local visibleRows = math.min(#filtered, MAX_ROWS)
    local totalHeight = PADDING + PROMPT_HEIGHT + 6 + (visibleRows * ROW_HEIGHT) + PADDING
    if pos.x < panelX or pos.y > TOP_OFFSET + totalHeight then
      hide()
    end
    return false
  end)
  clickWatcher:start()

  typedWatcher = hs.eventtap.new({ hs.eventtap.event.types.keyDown }, function(event)
    local keyCode = event:getKeyCode()
    local flags = event:getFlags()

    if keyCode == 53 then hide(); return true end
    if keyCode == 36 then launch(); return true end

    if keyCode == 51 then
      query = query:sub(1, -2)
      updateFiltered()
      return true
    end

    if keyCode == 125 or (keyCode == 45 and flags.ctrl) then
      selectedIdx = math.min(selectedIdx + 1, math.min(#filtered, MAX_ROWS))
      draw()
      return true
    end

    if keyCode == 126 or (keyCode == 35 and flags.ctrl) then
      selectedIdx = math.max(selectedIdx - 1, 1)
      draw()
      return true
    end

    if keyCode == 48 then
      selectedIdx = selectedIdx % math.min(#filtered, MAX_ROWS) + 1
      draw()
      return true
    end

    local char = event:getCharacters()
    if char and #char == 1 and not flags.cmd and not flags.ctrl and not flags.alt then
      query = query .. char
      updateFiltered()
      return true
    end

    return true
  end)
  typedWatcher:start()
end

local function toggle()
  if isVisible then hide() else show() end
end

hs.hotkey.bind({ "alt" }, "space", toggle)
hs.hotkey.bind({}, "f19", toggle)
hs.urlevent.bind("launcher", function() toggle() end)
hs.hotkey.bind({ "cmd", "alt", "ctrl" }, "r", function() hs.reload() end)
hs.alert.show("Hammerspoon loaded")
