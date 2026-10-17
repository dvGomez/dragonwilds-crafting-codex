-- CraftCodex world restore: refills chests/stations of a rebuilt world from a capture.
-- Runs once when %LOCALAPPDATA%\RSDragonwilds\Saved\CraftCodex\restore\plan.lua exists and this
-- game is the host (authority). plan.lua is written by tools/restore_world.py and returns
-- { containers = { { cls=, loc={x,y,z}, comp=, compName=, items={ {slot=,path=,count=,pct=}, ... } }, ... } }
-- Result goes to restore\report.txt and plan.lua is renamed to plan.done.lua.
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

local function findActor(actors, cls, loc, used)
    local best, bestD = nil, 200 * 200 -- within 2 m
    for _, a in ipairs(actors) do
        if not used[a:GetAddress()] and a:GetClass():GetFName():ToString() == cls then
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

-- returns true when finished (successfully or not), false to retry later
function M.tryRun()
    local planFile = DIR .. "plan.lua"
    local f = io.open(planFile, "r")
    if not f then return true end
    f:close()

    local gbm = (FindAllOf("GlobalBuildingManager") or {})[1]
    if not valid(gbm) then return false end
    local okAuth, auth = pcall(function() return gbm:HasAuthority() end)
    if not okAuth or not auth then return false end -- only the host can restore
    local actors = FindAllOf("BaseBuildingActor") or {}
    if #actors == 0 then return false end -- world still loading

    local plan = dofile(planFile)
    local lines, cache, used = {}, {}, {}
    local okC, okI, failI = 0, 0, 0
    for _, c in ipairs(plan.containers) do
        local actor = findActor(actors, c.cls, c.loc, used)
        local comp = actor and findComponent(actor, c.comp, c.compName)
        if not comp then
            lines[#lines + 1] = string.format("MISSING %s %s at (%.0f, %.0f, %.0f)", c.cls, c.compName, c.loc[1], c.loc[2], c.loc[3])
        else
            pcall(function() comp:ClearInventory() end)
            for _, it in ipairs(c.items) do
                local data = loadItemData(it.path, cache)
                local ok, res = false, false
                if data then ok, res = pcall(function() return comp:AddItemByDataToSlot(data, it.slot, it.count, it.pct or 1.0, {}) end) end
                if ok and res then okI = okI + 1 else
                    failI = failI + 1
                    lines[#lines + 1] = string.format("  item failed: %s x%d slot %d in %s", it.path, it.count, it.slot, c.cls)
                end
            end
            okC = okC + 1
        end
    end
    table.insert(lines, 1, string.format("restored %d/%d containers, %d items ok, %d failed", okC, #plan.containers, okI, failI))
    local r = io.open(DIR .. "report.txt", "w")
    if r then r:write(table.concat(lines, "\n")) r:close() end
    os.rename(planFile, DIR .. "plan.done.lua")
    print("[CraftCodex] " .. lines[1] .. "\n")
    return true
end

return M
