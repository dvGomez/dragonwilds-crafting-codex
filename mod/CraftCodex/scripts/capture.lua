-- CraftCodex world capture: snapshots what this client knows about the current world
-- (building pieces, building actors, every inventory) into
-- %LOCALAPPDATA%\RSDragonwilds\Saved\CraftCodex\capture\capture_<time>.json
-- Used to back up a world hosted elsewhere (e.g. a friend's console world) and rebuild it on PC.
local M = {}
local OUTDIR = (os.getenv("LOCALAPPDATA") or ".") .. "/RSDragonwilds/Saved/CraftCodex/capture/"

local function js(s)
    s = tostring(s or "")
    return '"' .. s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end) .. '"'
end
local function num(v) if v == nil then return "null" end return string.format("%.4f", v) end
local function vec(v) return string.format("[%s,%s,%s]", num(v.X), num(v.Y), num(v.Z)) end
local function valid(o) return o ~= nil and o.IsValid ~= nil and o:IsValid() end
local function assetPath(obj)
    local p = ""
    pcall(function() p = obj:GetFullName():match("^%S+%s+(.-)%.[^%.]*$") or "" end)
    return p
end

local function capturePieces(log)
    local out = {}
    local g = (FindAllOf("GlobalBuildingManager") or {})[1]
    if not valid(g) then log("no GlobalBuildingManager") return out end
    g.BuildingPieces:ForEach(function(k, v)
        local id = k:get()
        local c = v:get().ClientVisible
        out[#out + 1] = string.format('{"id":%d,"idx":%d,"loc":%s,"yaw":%s,"ghost":%s,"stab":%s,"hp":%s}',
            id, c.BuildingPieceDataIndex, vec(c.Location), num(c.Yaw), tostring(c.bGhosted), num(c.StabilityValue), num(c.FractionalHealth))
    end)
    log("pieces", #out)
    return out
end

local function captureActors(log)
    local out = {}
    for _, a in ipairs(FindAllOf("BaseBuildingActor") or {}) do
        if valid(a) then
            local okL, L = pcall(function() return a:K2_GetActorLocation() end)
            local okR, R = pcall(function() return a:K2_GetActorRotation() end)
            out[#out + 1] = string.format('{"cls":%s,"name":%s,"loc":%s,"rot":%s}',
                js(a:GetClass():GetFName():ToString()), js(a:GetFName():ToString()),
                okL and vec(L) or "null",
                okR and string.format("[%s,%s,%s]", num(R.Pitch), num(R.Yaw), num(R.Roll)) or "null")
        end
    end
    log("building actors", #out)
    return out
end

local function captureInventories(log)
    local out, seen = {}, {}
    for _, cls in ipairs({ "InventoryComponent", "InventoryWithLogComponent", "LoadoutComponent", "PersonalInventoryComponent" }) do
        for _, comp in ipairs(FindAllOf(cls) or {}) do
            local addr = valid(comp) and comp:GetAddress()
            if addr and not seen[addr] then
                seen[addr] = true
                local okO, owner = pcall(function() return comp:GetOwner() end)
                local items = {}
                pcall(function()
                    comp.ItemSlots:ForEach(function(slot, e)
                        local it = e:get()
                        if valid(it) then
                            local dur, maxDur, mw = nil, nil, nil
                            pcall(function() dur = it.Durability end)
                            pcall(function() maxDur = it:GetMaxDurability() end)
                            pcall(function() mw = it.NumMasterworkUpgradesApplied end)
                            items[#items + 1] = string.format('{"slot":%d,"path":%s,"count":%d,"dur":%s,"maxDur":%s,"mw":%s}',
                                slot, js(assetPath(it.ItemData)), it.Count or 1, dur and tostring(dur) or "null",
                                maxDur and tostring(maxDur) or "null", mw and tostring(mw) or "null")
                        end
                    end)
                end)
                if #items > 0 then
                    local L = nil
                    local ownerOk = okO and valid(owner)
                    if ownerOk then pcall(function() L = owner:K2_GetActorLocation() end) end
                    out[#out + 1] = string.format('{"owner":%s,"ownerName":%s,"comp":%s,"compName":%s,"loc":%s,"items":[%s]}',
                        js(ownerOk and owner:GetClass():GetFName():ToString() or "?"), js(ownerOk and owner:GetFName():ToString() or "?"),
                        js(comp:GetClass():GetFName():ToString()), js(comp:GetFName():ToString()), L and vec(L) or "null",
                        table.concat(items, ","))
                end
            end
        end
    end
    log("inventories", #out)
    return out
end

function M.run(log)
    log = log or function() end
    local pieces = capturePieces(log)
    local actors = captureActors(log)
    local invs = captureInventories(log)
    local fname = OUTDIR .. "capture_" .. os.date("%Y%m%d_%H%M%S") .. ".json"
    local f = io.open(fname, "w")
    if not f then log("cannot write", fname) return nil end
    f:write('{"version":1,"time":' .. os.time() .. ',"pieces":[' .. table.concat(pieces, ",") ..
        '],"actors":[' .. table.concat(actors, ",") .. '],"inventories":[' .. table.concat(invs, ",") .. ']}')
    f:close()
    log("saved", fname)
    return fname
end

return M
