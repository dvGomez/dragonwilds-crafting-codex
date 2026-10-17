-- CraftCodex world restore: refills chests/stations of a rebuilt world from a capture.
-- Active while %LOCALAPPDATA%\RSDragonwilds\Saved\CraftCodex\restore\plan.lua exists and this game is the
-- host (authority). plan.lua is written by tools/restore_world.py and returns
-- { containers = { { cls=, loc={x,y,z}, comp=, compName=, items={ {slot=,path=,count=,pct=}, ... } }, ... } }
-- Building actors only spawn near the player, so each container is filled the first time it is found;
-- progress is kept in restore\progress.txt and the result in restore\report.txt. When every container
-- is done, plan.lua is renamed to plan.done.lua.
local M = {}
local DIR = (os.getenv("LOCALAPPDATA") or ".") .. "/RSDragonwilds/Saved/CraftCodex/restore/"

local function valid(o) return o ~= nil and o.IsValid ~= nil and o:IsValid() end

local function loadItemData(path, cache)
    if cache[path] ~= nil then return cache[path] end
    local objPath = path .. "." .. path:match("([^/]+)$")
    local obj = StaticFindObject(objPath)
    if not valid(obj) then pcall(function() obj = LoadAsset(objPath) end) end
    cache[path] = valid(obj) and obj or false
    return cache[path]
end

local function findActor(actors, cls, loc)
    local best, bestD = nil, 200 * 200 -- within 2 m
    for _, a in ipairs(actors) do
        if valid(a) and a:GetClass():GetFName():ToString() == cls then
            local ok, L = pcall(function() return a:K2_GetActorLocation() end)
            if ok then
                local d = (L.X - loc[1]) ^ 2 + (L.Y - loc[2]) ^ 2 + (L.Z - loc[3]) ^ 2
                if d < bestD then best, bestD = a, d end
            end
        end
    end
    return best
end

local function findComponent(actor, compClass, compName)
    for _, c in ipairs(FindAllOf(compClass) or {}) do
        if valid(c) and c:GetFName():ToString() == compName then
            local ok, owner = pcall(function() return c:GetOwner() end)
            if ok and valid(owner) and owner:GetAddress() == actor:GetAddress() then return c end
        end
    end
    return nil
end

local function readLines(path)
    local t, f = {}, io.open(path, "r")
    if f then for l in f:lines() do t[#t + 1] = l end f:close() end
    return t
end

local function appendLine(path, line)
    local f = io.open(path, "a")
    if f then f:write(line .. "\n") f:close() end
end

function M.tryRun()
    local planFile = DIR .. "plan.lua"
    local f = io.open(planFile, "r")
    if not f then return end
    f:close()

    local gbm = (FindAllOf("GlobalBuildingManager") or {})[1]
    if not valid(gbm) then return end
    local okAuth, auth = pcall(function() return gbm:HasAuthority() end)
    if not okAuth or not auth then return end -- only the host can restore
    local actors = FindAllOf("BaseBuildingActor") or {}
    if #actors == 0 then return end

    local plan = dofile(planFile)
    local done = {}
    for _, l in ipairs(readLines(DIR .. "progress.txt")) do done[tonumber(l)] = true end
    local cache = {}
    local remaining = 0
    for i, c in ipairs(plan.containers) do
        if not done[i] then
            local actor = findActor(actors, c.cls, c.loc)
            local comp = actor and findComponent(actor, c.comp, c.compName)
            if not comp then
                remaining = remaining + 1
            else
                pcall(function() comp:ClearInventory() end)
                local okI, failI = 0, 0
                for _, it in ipairs(c.items) do
                    local data = loadItemData(it.path, cache)
                    local ok, res = false, false
                    if data then ok, res = pcall(function() return comp:AddItemByDataToSlot(data, it.slot, it.count, it.pct or 1.0, {}) end) end
                    if ok and res then okI = okI + 1 else
                        failI = failI + 1
                        appendLine(DIR .. "report.txt", string.format("  item failed: %s x%d slot %d in %s (%s)", it.path, it.count, it.slot, c.cls, tostring(res)))
                    end
                end
                appendLine(DIR .. "report.txt", string.format("filled %s %s: %d items ok, %d failed", c.cls, c.compName, okI, failI))
                appendLine(DIR .. "progress.txt", tostring(i))
                print(string.format("[CraftCodex] restored %s (%d items)\n", c.cls, okI))
            end
        end
    end
    if remaining == 0 then
        appendLine(DIR .. "report.txt", "ALL CONTAINERS RESTORED")
        os.rename(planFile, DIR .. "plan.done.lua")
    end
end

return M
