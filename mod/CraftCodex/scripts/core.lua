-- CraftCodex (UE4SS mod for RuneScape: Dragonwilds)
-- Exports the LIVE session inventory: the local player's bags/equipment and every
-- container currently loaded in the world (your world or a friend's), so the
-- Crafting Codex app can tell what you have and what's still missing.
-- Output: %LOCALAPPDATA%\RSDragonwilds\Saved\CraftCodex\live.json (rewritten when it changes)

local OUT_FILE = (os.getenv("LOCALAPPDATA") or ".") .. "\\RSDragonwilds\\Saved\\CraftCodex\\live.json"
local COMPONENT_CLASSES = { "InventoryComponent", "InventoryWithLogComponent", "LoadoutComponent", "PersonalInventoryComponent" }

local lastJson, lastWrite = nil, 0

local function jsonStr(s)
    s = tostring(s or "")
    return '"' .. s:gsub('[%c"\\]', function(c) return string.format("\\u%04x", c:byte()) end) .. '"'
end

local function valid(o)
    return o ~= nil and o.IsValid ~= nil and o:IsValid()
end

local function className(obj)
    local ok, name = pcall(function() return obj:GetClass():GetFName():ToString() end)
    return ok and name or "?"
end

local function localPawn()
    local pcs = FindAllOf("PlayerController")
    if not pcs then return nil end
    for _, pc in ipairs(pcs) do
        if valid(pc) then
            local ok, isLocal = pcall(function() return pc:IsLocalController() end)
            if ok and isLocal then
                local pawn = pc.Pawn
                if valid(pawn) then return pawn end
            end
        end
    end
    return nil
end

local function addrOf(getter)
    local ok, o = pcall(getter)
    if ok and valid(o) then return o:GetAddress() end
    return nil
end

-- "mine" | "other" (another player's pawn/state/controller) | nil (world actor)
local function playerOwnership(owner, me)
    local a = owner:GetAddress()
    if me then
        if a == me:GetAddress() then return "mine" end
        if a == addrOf(function() return me.PlayerState end) then return "mine" end
        if a == addrOf(function() return me.Controller end) then return "mine" end
    end
    if addrOf(function() return owner.PlayerState end) then return "other" end
    local cls = className(owner)
    if cls:find("PlayerState") or cls:find("PlayerController") then return "other" end
    return nil
end

-- ItemDataPersistenceId is empty at runtime: identify items by their ItemData asset instead.
local idCache = {}
local function itemIdentity(item)
    local ok, data = pcall(function() return item.ItemData end)
    if not ok or not valid(data) then
        local ok2, pid = pcall(function() return item.ItemDataPersistenceId:ToString() end)
        return (ok2 and pid ~= "" and pid) or nil, nil
    end
    local addr = data:GetAddress()
    local hit = idCache[addr]
    if hit then return hit[1], hit[2] end
    local guid, path = nil, nil
    pcall(function() guid = data.PersistenceID:ToString() end)
    pcall(function()
        local full = data:GetFullName()            -- "ItemData /Game/X/ITEM_A.ITEM_A"
        path = full:match("^%S+%s+(.-)%.[^%.]*$") or full
    end)
    if guid == "" then guid = nil end
    idCache[addr] = { guid, path }
    return guid, path
end

local function readItems(comp)
    local out = {}
    local ok = pcall(function()
        comp.ItemSlots:ForEach(function(_, elem)
            local item = elem:get()
            if valid(item) then
                local guid, path = itemIdentity(item)
                if guid or path then
                    local n = item.Count
                    if n == nil or n < 1 then n = 1 end
                    out[#out + 1] = string.format('{"guid":%s,"path":%s,"count":%d}', jsonStr(guid), jsonStr(path), n)
                end
            end
        end)
    end)
    return ok and out or {}
end

local function location(actor)
    local ok, v = pcall(function() return actor:K2_GetActorLocation() end)
    if ok and v then return v.X or 0, v.Y or 0, v.Z or 0 end
    return 0, 0, 0
end

local function snapshot()
    local me = localPawn()
    local px, py, pz = 0, 0, 0
    if me then px, py, pz = location(me) end

    local seen, sources = {}, {}
    for _, cls in ipairs(COMPONENT_CLASSES) do
        local comps = FindAllOf(cls)
        if comps then
            for _, comp in ipairs(comps) do
                local addr = valid(comp) and comp:GetAddress() or nil
                if addr and not seen[addr] then
                    seen[addr] = true
                    local okOwner, owner = pcall(function() return comp:GetOwner() end)
                    local who = "other"
                    if okOwner and valid(owner) then who = playerOwnership(owner, me) end
                    if who ~= "other" then
                        local items = readItems(comp)
                        if #items > 0 then
                            local compCls = className(comp)
                            local kind, dist = "world", 0
                            if who == "mine" then
                                kind = compCls:find("Loadout") and "equipped" or (compCls:find("Personal") and "personal" or "inventory")
                            else
                                local x, y, z = location(owner)
                                dist = math.sqrt((x - px) ^ 2 + (y - py) ^ 2 + (z - pz) ^ 2) / 100 -- metres
                            end
                            sources[#sources + 1] = string.format(
                                '{"id":%s,"kind":%s,"cls":%s,"comp":%s,"dist":%.1f,"items":[%s]}',
                                jsonStr(string.format("%x", addr)), jsonStr(kind), jsonStr(className(owner)), jsonStr(compCls), dist,
                                table.concat(items, ","))
                        end
                    end
                end
            end
        end
    end
    return string.format('{"version":1,"hasPlayer":%s,"sources":[%s]',
        me and "true" or "false", table.concat(sources, ","))
end

local function write()
    local ok, body = pcall(snapshot)
    if not ok then
        print("[CraftCodex] snapshot failed: " .. tostring(body) .. "\n")
        return
    end
    -- unchanged: only refresh the heartbeat every ~10s
    if body == lastJson and os.time() - lastWrite < 10 then return end
    lastJson, lastWrite = body, os.time()
    local f = io.open(OUT_FILE, "w")
    if not f then return end -- folder is created by the Codex app / installer
    f:write(body .. string.format(',"time":%d}', os.time()))
    f:close()
end

return { tick = write }
