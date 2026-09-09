-- PR review-requests panel (same look as the Dracula launcher)
-- opened via hammerspoon://prs (sketchybar item click), esc to close,
-- type to filter, enter to open the PR in the browser

local colors = {
  bg        = { hex = "#282a36" },
  fg        = { hex = "#f8f8f2" },
  comment   = { hex = "#6272a4" },
  purple    = { hex = "#bd93f9" },
  green     = { hex = "#50fa7b" },
  selection = { hex = "#44475a" },
}

local FONT         = "JetBrainsMono Nerd Font"
local FONT_SIZE    = 14
local CHAR_WIDTH   = FONT_SIZE * 0.6 -- monospace, for right-aligned meta
local WIDTH        = 520
local ROW_HEIGHT   = 24
local MAX_ROWS     = 15
local PADDING      = 10
local PROMPT_HEIGHT = 24
local TOP_OFFSET   = 28

local GH = "/opt/homebrew/bin/gh"
local QUERY = "is:open is:pr review-requested:@me archived:false draft:false"
local JQ = '[.items[] | {title, url: .html_url, number, repo: (.repository_url|split("/")|last)}]'

local canvas       = nil
local typedWatcher = nil
local clickWatcher = nil
local query        = ""
local prs          = nil -- last successful fetch, kept across shows
local filtered     = {}
local selectedIdx  = 1
local isVisible    = false
local fetchFailed  = false

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
-- Draw
---------------------------------------------------------------------------
local draw -- forward declaration

local function updateFiltered()
  if not prs then
    filtered = {}
  elseif query == "" then
    filtered = prs
  else
    local scored = {}
    for _, pr in ipairs(prs) do
      local match, score = fuzzyMatch(pr.title .. " " .. pr.repo, query)
      if match then
        table.insert(scored, { entry = pr, score = score })
      end
    end
    table.sort(scored, function(a, b) return a.score > b.score end)
    filtered = {}
    for _, s in ipairs(scored) do table.insert(filtered, s.entry) end
  end
  selectedIdx = 1
  if isVisible then draw() end
end

local function statusLine()
  if fetchFailed and not prs then return "gh unreachable — check network" end
  if not prs then return "fetching pull requests…" end
  if #prs == 0 then return "nothing waiting on you" end
  return "no matches"
end

draw = function()
  if canvas then canvas:delete() end

  local screen = hs.screen.mainScreen():frame()
  local visibleRows = math.max(math.min(#filtered, MAX_ROWS), 1)
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

  -- Prompt icon
  canvas:appendElements({
    type = "text",
    text = "",
    textColor = colors.purple,
    textFont = FONT,
    textSize = FONT_SIZE,
    frame = { x = PADDING, y = PADDING, w = 18, h = PROMPT_HEIGHT },
  })

  -- Prompt query
  canvas:appendElements({
    type = "text",
    text = query .. "█",
    textColor = colors.green,
    textFont = FONT,
    textSize = FONT_SIZE,
    frame = { x = PADDING + 18, y = PADDING, w = WIDTH - PADDING * 2 - 70, h = PROMPT_HEIGHT },
  })

  -- Count, right-aligned in the prompt row
  if prs then
    local countText = "(" .. #prs .. ")"
    local countWidth = #countText * CHAR_WIDTH + 4
    canvas:appendElements({
      type = "text",
      text = countText,
      textColor = colors.comment,
      textFont = FONT,
      textSize = FONT_SIZE,
      frame = { x = WIDTH - PADDING - countWidth, y = PADDING, w = countWidth, h = PROMPT_HEIGHT },
    })
  end

  local startY = PADDING + PROMPT_HEIGHT + 6

  -- Empty / loading / error state
  if #filtered == 0 then
    canvas:appendElements({
      type = "text",
      text = statusLine(),
      textColor = colors.comment,
      textFont = FONT,
      textSize = FONT_SIZE,
      frame = { x = PADDING + 4, y = startY + 3, w = WIDTH - PADDING * 2 - 4, h = FONT_SIZE + 4 },
    })
    canvas:show()
    return
  end

  -- Rows: truncated title left, repo#number right
  for i = 1, math.min(#filtered, MAX_ROWS) do
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

    local meta = entry.repo .. "#" .. entry.number
    local metaWidth = #meta * CHAR_WIDTH + 4

    canvas:appendElements({
      type = "text",
      text = hs.styledtext.new(entry.title, {
        font = { name = FONT, size = FONT_SIZE },
        color = isSelected and colors.fg or colors.comment,
        paragraphStyle = { lineBreak = "truncateTail" },
      }),
      frame = { x = PADDING + 4, y = rowY + 3, w = WIDTH - PADDING * 2 - metaWidth - 12, h = FONT_SIZE + 6 },
    })

    canvas:appendElements({
      type = "text",
      text = meta,
      textColor = isSelected and colors.purple or colors.comment,
      textFont = FONT,
      textSize = FONT_SIZE,
      frame = { x = WIDTH - PADDING - metaWidth, y = rowY + 3, w = metaWidth, h = FONT_SIZE + 6 },
    })
  end

  canvas:show()
end

---------------------------------------------------------------------------
-- Fetch (async so the panel never blocks)
---------------------------------------------------------------------------
local function fetch()
  hs.task.new(GH, function(exitCode, stdOut, _)
    if exitCode == 0 then
      local ok, data = pcall(hs.json.decode, stdOut)
      if ok and data then
        prs = data
        fetchFailed = false
      else
        fetchFailed = true
      end
    else
      fetchFailed = true
    end
    updateFiltered()
  end, {
    "api", "-X", "GET", "search/issues",
    "-f", "q=" .. QUERY,
    "-f", "sort=updated", "-f", "order=desc",
    "--jq", JQ,
  }):start()
end

---------------------------------------------------------------------------
-- Show / hide
---------------------------------------------------------------------------
local hidePanel -- forward declaration

local function openSelected()
  local pr = filtered[selectedIdx]
  hidePanel()
  if pr then
    hs.timer.doAfter(0.01, function() hs.urlevent.openURL(pr.url) end)
  end
end

hidePanel = function()
  if canvas then canvas:delete(); canvas = nil end
  if typedWatcher then typedWatcher:stop(); typedWatcher = nil end
  if clickWatcher then clickWatcher:stop(); clickWatcher = nil end
  isVisible = false
  query = ""
  selectedIdx = 1
end

local function show()
  query = ""
  selectedIdx = 1
  isVisible = true
  updateFiltered() -- draws cached list immediately (or the loading state)
  fetch()          -- then refreshes in place

  clickWatcher = hs.eventtap.new({ hs.eventtap.event.types.leftMouseDown }, function(event)
    local pos = event:location()
    local screen = hs.screen.mainScreen():frame()
    local panelX = screen.x + screen.w - WIDTH - 8
    local visibleRows = math.max(math.min(#filtered, MAX_ROWS), 1)
    local totalHeight = PADDING + PROMPT_HEIGHT + 6 + (visibleRows * ROW_HEIGHT) + PADDING
    if pos.x < panelX or pos.y > TOP_OFFSET + totalHeight then
      hidePanel()
    end
    return false
  end)
  clickWatcher:start()

  typedWatcher = hs.eventtap.new({ hs.eventtap.event.types.keyDown }, function(event)
    local keyCode = event:getKeyCode()
    local flags = event:getFlags()

    if keyCode == 53 then hidePanel(); return true end
    if keyCode == 36 then openSelected(); return true end

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
  if isVisible then hidePanel() else show() end
end

hs.urlevent.bind("prs", toggle)

return { toggle = toggle }
