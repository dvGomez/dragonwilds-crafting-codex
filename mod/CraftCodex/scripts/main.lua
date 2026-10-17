-- CraftCodex loader: runs core.lua and reloads it whenever the file changes (no game restart needed).
-- Also runs a one-shot probe.lua (if present) and writes its output to probe_out.txt, for debugging.
local DIR = debug.getinfo(1, "S").source:match("^@(.*[/\\])") or ""
local INTERVAL_MS = 2000

local function readFile(p)
    local f = io.open(p, "rb")
    if not f then return nil end
    local s = f:read("*a")
    f:close()
    return s
end

local coreSrc, core = nil, nil
local probeSrc = nil

local function tick()
    -- (re)load core.lua
    local src = readFile(DIR .. "core.lua")
    if src and src ~= coreSrc then
        coreSrc = src
        local chunk, err = load(src, "@core.lua")
        if chunk then
            local ok, mod = pcall(chunk)
            if ok then core = mod; print("[CraftCodex] core.lua loaded\n") else print("[CraftCodex] core.lua error: " .. tostring(mod) .. "\n") end
        else
            print("[CraftCodex] core.lua syntax error: " .. tostring(err) .. "\n")
        end
    end
    if core and core.tick then
        local ok, err = pcall(core.tick)
        if not ok then print("[CraftCodex] tick error: " .. tostring(err) .. "\n") end
    end
    -- one-shot probe
    local p = readFile(DIR .. "probe.lua")
    if p and p ~= probeSrc then
        probeSrc = p
        local lines = {}
        local env = setmetatable({ out = function(...) local t = {} for i = 1, select("#", ...) do t[#t + 1] = tostring((select(i, ...))) end lines[#lines + 1] = table.concat(t, "\t") end }, { __index = _G })
        local chunk, err = load(p, "@probe.lua", "t", env)
        local ok, perr = false, err
        if chunk then ok, perr = pcall(chunk) end
        if not ok then lines[#lines + 1] = "ERROR: " .. tostring(perr) end
        local f = io.open(DIR .. "probe_out.txt", "w")
        if f then f:write(table.concat(lines, "\n")) f:close() end
    end
end

LoopAsync(INTERVAL_MS, function()
    ExecuteInGameThread(function()
        local ok, err = pcall(tick)
        if not ok then print("[CraftCodex] " .. tostring(err) .. "\n") end
    end)
    return false
end)
print("[CraftCodex] loader started in " .. DIR .. "\n")
