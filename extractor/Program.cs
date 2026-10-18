using System.Diagnostics;
using CUE4Parse.FileProvider;
using CUE4Parse.MappingsProvider.Usmap;
using CUE4Parse.UE4.Assets.Exports;
using CUE4Parse.UE4.Assets.Exports.Texture;
using CUE4Parse.UE4.Versions;
using CUE4Parse_Conversion;
using CUE4Parse_Conversion.Textures;
using CUE4Parse.UE4.Localization;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

// Extracts item / recipe / building data, localization and icons from the installed game.
// Usage: extractor <PaksDir> <usmap> <outDir> [probe <asset>... | list <filter> [n] | dump]

var paks = args[0];
var usmap = args[1];
var outDir = args[2];
var mode = args.Length > 3 ? args[3] : "dump";

var provider = new DefaultFileProvider(paks, SearchOption.TopDirectoryOnly, new VersionContainer(EGame.GAME_UE5_6));
provider.MappingsContainer = new FileUsmapTypeMappingsProvider(usmap);
provider.Initialize();
provider.Mount();
Console.Error.WriteLine($"Files: {provider.Files.Count}");

if (mode == "types")
{
    foreach (var t in typeof(CUE4Parse_Conversion.Textures.TextureDecoder).Assembly.GetTypes().Where(t => t.Name.Contains("Texture") || t.Name.Contains("Format")))
        Console.WriteLine(t.FullName + " :: " + string.Join(", ", t.GetMethods().Where(m => m.Name.Contains("Encode") || m.Name == "Decode").Select(m => m.ToString())));
    return;
}
if (mode == "ui")
{
    // export UI textures from folders + raw font files
    var uiOut = Path.Combine(outDir, "ui"); Directory.CreateDirectory(uiOut);
    var folders = args.Skip(4).ToArray();
    foreach (var f in provider.Files.Keys.Where(k => folders.Any(d => k.Contains(d, StringComparison.OrdinalIgnoreCase))))
    {
        try
        {
            if (f.EndsWith(".ufont")) { File.WriteAllBytes(Path.Combine(uiOut, Path.GetFileNameWithoutExtension(f) + ".ttf"), provider.SaveAsset(f)[4..]); continue; } // skip int32 size prefix
            if (!f.EndsWith(".uasset")) continue;
            var o = provider.LoadPackage(f).GetExports().FirstOrDefault(e => e is UTexture2D) as UTexture2D;
            if (o != null) File.WriteAllBytes(Path.Combine(uiOut, Path.GetFileNameWithoutExtension(f) + ".png"), TexturePng(o));
        }
        catch (Exception e) { Console.Error.WriteLine($"{f}: {e.Message}"); }
    }
    return;
}
if (mode == "raw")
{
    var pk = provider.LoadPackage(args[4]);
    Console.WriteLine(pk.GetType().FullName);
    try { var bb = provider.SaveAsset(args[4]); Console.WriteLine($"bytes {bb.Length}"); File.WriteAllBytes(Path.Combine(outDir, "raw.bin"), bb); } catch (Exception e) { Console.WriteLine(e); }
    if (pk is CUE4Parse.UE4.Assets.IoPackage iop) Console.WriteLine(string.Join(" | ", iop.NameMap.Select(n => n.Name)));
    var jt = new JObject { ["Properties"] = new JObject() };
    RawFallback(provider, pk, args[4], jt);
    Console.WriteLine(jt.ToString());
    return;
}
if (mode == "probe")
{
    foreach (var p in args.Skip(4))
        Console.WriteLine(JsonConvert.SerializeObject(provider.LoadPackage(p).GetExports(), Formatting.Indented));
    return;
}
if (mode == "refs")
{
    // Every gameplay asset (nodes, spawners, creatures, loot tables, fishing, farming...) that references item data,
    // used to work out where each item comes from. Writes <outDir>/refs.json.
    var itemRef = new System.Text.RegularExpressions.Regex(@"/(ITEM_|DA_Consumable)[A-Za-z0-9_]+");
    var skipName = new System.Text.RegularExpressions.Regex(@"^(ITEM_|RECIPE_|BUILDPIECE_|DA_Recipe|DA_BaseBuilding|DA_Consumable|JOURNAL_|WBP_|T_|SM_|SK_|M_|MI_|NS_|ABP_|AM_|BS_|MSS_|ADA_)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
    var cands = provider.Files.Keys.Where(k => k.EndsWith(".uasset")
        && (k.Contains("/Gameplay/") || k.Contains("Loot", StringComparison.OrdinalIgnoreCase))
        && !k.Contains("/Art/") && !k.Contains("/Audio/") && !k.Contains("/UI/") && !k.Contains("/Cinematics/")
        && !skipName.IsMatch(Path.GetFileName(k))).ToList();
    Console.Error.WriteLine($"refs candidates: {cands.Count}");
    var ser = JsonSerializer.Create(new JsonSerializerSettings { ReferenceLoopHandling = ReferenceLoopHandling.Ignore });
    var outArr = new JArray();
    int k2 = 0;
    foreach (var path in cands)
    {
        if (++k2 % 2000 == 0) Console.Error.WriteLine($"  {k2}/{cands.Count}");
        try
        {
            var exps = provider.LoadPackage(path).GetExports().ToList();
            var arr = JArray.FromObject(exps, ser);
            var s = arr.ToString(Formatting.None);
            var hits = itemRef.Matches(s).Select(m => m.Value).Distinct().ToList();
            if (hits.Count == 0) continue;
            outArr.Add(new JObject { ["path"] = path, ["types"] = new JArray(exps.Select(e => e.ExportType).Distinct()), ["refs"] = new JArray(hits), ["exports"] = s.Length < 400_000 ? arr : null });
        }
        catch { }
    }
    File.WriteAllText(Path.Combine(outDir, "refs.json"), outArr.ToString(Formatting.None));
    Console.Error.WriteLine($"refs: {outArr.Count} assets reference items");
    return;
}
if (mode == "list")
{
    foreach (var f in provider.Files.Keys.Where(k => k.Contains(args[4], StringComparison.OrdinalIgnoreCase)).Take(args.Length > 5 ? int.Parse(args[5]) : 50))
        Console.WriteLine(f);
    return;
}

Directory.CreateDirectory(outDir);
var sw = Stopwatch.StartNew();

// 1) Every gameplay/data asset whose main export is something we care about.
var interesting = new HashSet<string> { "AmmoData", "BP_Consumables_Base_C", "BP_Consumables_BuildingUnlocker_C", "BP_Consumables_Drink_C", "BP_Consumables_Food_C",
    "BP_Consumables_ItemEmitter_C", "BP_Consumables_Plan_Base_C", "BP_Consumables_Potion_C", "BP_Consumables_RecipeUnlocker2_C", "BP_Consumables_SkillTome_C",
    "BuffItemData", "CompostChargeData", "ConsumableItemData", "ConsumableMountUnlocker", "ConsumableRecipeUnlocker", "DrinkItemData", "EquipmentData",
    "FishingBaitAmmoData", "FishingRodHeldEquipmentData", "FoodItemData", "FuelItemData", "HarvestToolEquipmentData", "HeldContainerEquipmentData",
    "HeldEquipmentData", "HeldTreeSeedData", "ItemData", "JewelleryData", "JournalItemData", "MagicAmmoData", "PotionItemData", "RangedAmmoData",
    "SeedHeldEquipmentData", "ShieldData", "SpadeToolEquipmentData", "TrinketItemData", "WardstoneItemData", "WearableEquipmentData", "WhetstoneItemData",
    "RecipeData", "RuneRecipeData", "BuildingPieceData", "JournalEntryRecipeData" };
var assets = new JArray();
var dataTables = new JArray();
var stationComponents = new JArray();
var candidates = provider.Files.Keys
    .Where(k => k.EndsWith(".uasset") && (k.Contains("/Gameplay/") || k.Contains("/Data/")) && !k.Contains("/Art/") && !k.Contains("/Audio/"))
    .ToList();
Console.Error.WriteLine($"Candidates: {candidates.Count}");
var serializer = JsonSerializer.Create(new JsonSerializerSettings { ReferenceLoopHandling = ReferenceLoopHandling.Ignore });
int n = 0, failed = 0;
foreach (var path in candidates)
{
    if (++n % 2000 == 0) Console.Error.WriteLine($"  {n}/{candidates.Count} ({sw.Elapsed.TotalSeconds:F0}s)");
    var name = Path.GetFileNameWithoutExtension(path);
    try
    {
        var pkg = provider.LoadPackage(path);
        foreach (var exp in pkg.GetExports())
        {
            var type = exp.ExportType;
            bool keep = (interesting.Contains(type) || type.StartsWith("BP_Consumables_")) && exp.Name == name;
            bool table = type == "DataTable";
            bool station = type.Contains("StationComponent") || type.Contains("ProcessingStation");
            if (!keep && !table && !station) continue;
            var jo = JObject.FromObject(exp, serializer);
            jo["__path"] = path;
            if (keep && jo["Properties"]?["PersistenceID"] == null) RawFallback(provider, pkg, path, jo);
            if (keep) assets.Add(jo);
            else if (table)
            {
                var s = jo.ToString(Formatting.None);
                if (s.Contains("RECIPE_") || s.Contains("BUILDPIECE_")) dataTables.Add(jo);
            }
            else stationComponents.Add(jo);
        }
    }
    catch { failed++; }
}
Console.Error.WriteLine($"Assets: {assets.Count}, tables: {dataTables.Count}, station comps: {stationComponents.Count}, failed: {failed} ({sw.Elapsed.TotalSeconds:F0}s)");
File.WriteAllText(Path.Combine(outDir, "assets.json"), assets.ToString(Formatting.None));
File.WriteAllText(Path.Combine(outDir, "tables.json"), dataTables.ToString(Formatting.None));
File.WriteAllText(Path.Combine(outDir, "stations.json"), stationComponents.ToString(Formatting.None));

// 2) String tables (namespace + source strings) referenced by FText TableId.
var tableIds = new HashSet<string>();
foreach (var t in assets.SelectTokens("$..TableId").Concat(dataTables.SelectTokens("$..TableId")).Concat(stationComponents.SelectTokens("$..TableId")))
    tableIds.Add((string)t!);
var stringTables = new JObject();
foreach (var id in tableIds)
{
    try
    {
        var pkgPath = id.Split('.')[0];
        var resolved = ResolvePluginPath(provider, id);
        var exp = provider.LoadPackage(resolved != id ? resolved[..resolved.LastIndexOf('.')] + ".uasset" : provider.FixPath(pkgPath + ".uasset")).GetExports().First();
        stringTables[id] = JObject.FromObject(exp, serializer);
    }
    catch (Exception e) { Console.Error.WriteLine($"  string table {id}: {e.Message}"); }
}
File.WriteAllText(Path.Combine(outDir, "stringtables.json"), stringTables.ToString(Formatting.None));

// 3) Localization: dump locres for each culture we support.
foreach (var code in new[] { "en", "pt-BR" })
{
    var locPath = provider.Files.Keys.First(k => k.EndsWith($"Localization/Game/{code}/Game.locres", StringComparison.OrdinalIgnoreCase));
    var loc = new FTextLocalizationResource(provider.CreateReader(locPath));
    File.WriteAllText(Path.Combine(outDir, $"locres.{code}.json"), JsonConvert.SerializeObject(loc));
    Console.Error.WriteLine($"Locres {code}: {locPath}");
}

// 4) Icons for items / building pieces.
var iconDir = Path.Combine(outDir, "icons");
Directory.CreateDirectory(iconDir);
var icons = new HashSet<string>();
foreach (var t in assets.SelectTokens("$..Icon.AssetPathName").Concat(assets.SelectTokens("$..DisplayIcon.AssetPathName")))
    if (!string.IsNullOrEmpty((string?)t)) icons.Add((string)t!);
int okIcons = 0;
foreach (var icon in icons)
{
    var objName = icon.Split('.').Last();
    var target = Path.Combine(iconDir, objName + ".png");
    if (File.Exists(target)) { okIcons++; continue; }
    try
    {
        var tex = provider.LoadPackageObject<UTexture2D>(ResolvePluginPath(provider, icon));
        File.WriteAllBytes(target, TexturePng(tex));
        okIcons++;
    }
    catch (Exception e) { Console.Error.WriteLine($"  icon {icon}: {e.Message}"); }
}
Console.Error.WriteLine($"Icons: {okIcons}/{icons.Count}. Done in {sw.Elapsed.TotalSeconds:F0}s");

static byte[] EncodePng(CTexture tex) => TextureEncoder.Encode(tex, CUE4Parse_Conversion.Options.ETextureFormat.Png, false, out _, 0);

// The public .usmap is older than the game build and mis-reads some classes (all EquipmentData).
// Recover the essentials straight from the package bytes + name map.
static void RawFallback(DefaultFileProvider provider, CUE4Parse.UE4.Assets.IPackage pkg, string path, JObject jo)
{
    if (pkg is not CUE4Parse.UE4.Assets.IoPackage io) return;
    byte[] bytes;
    try { bytes = provider.SaveAsset(path); } catch { return; }
    var names = io.NameMap.Select(n => n.Name ?? "").ToList();
    if (jo["Properties"] is not JObject props) { props = new JObject(); jo["Properties"] = props; }
    jo["__raw"] = true;
    // PersistenceID: FString of 22 base64url chars
    var guid = System.Text.RegularExpressions.Regex.Match(System.Text.Encoding.Latin1.GetString(bytes), @"\x17\x00\x00\x00([A-Za-z0-9_-]{22})\x00");
    if (guid.Success) props["PersistenceID"] = guid.Groups[1].Value;
    // Name: FText StringTableEntry = u32 flags, u8 11, FName(table) {i32 idx, i32 num}, FString key
    if (props["Name"] == null)
    {
        // first string-table FText in the export is the item name
        int best = int.MaxValue; JObject? found = null;
        for (int t = 0; t < names.Count; t++)
        {
            if (!names[t].StartsWith("/") || !names[t].Contains("/ST_") || !names[t].Contains('.')) continue;
            var needle = new byte[9]; needle[0] = 11; BitConverter.GetBytes(t).CopyTo(needle, 1);
            var at = bytes.AsSpan().IndexOf(needle);
            if (at < 0 || at >= best || at + 13 > bytes.Length) continue;
            int len = BitConverter.ToInt32(bytes, at + 9);
            if (len <= 1 || len > 200 || at + 13 + len > bytes.Length) continue;
            best = at;
            found = new JObject { ["TableId"] = names[t], ["Key"] = System.Text.Encoding.UTF8.GetString(bytes, at + 13, len - 1) };
        }
        if (found != null) props["Name"] = found;
    }
    // gameplay tags used by the item (filter category, armour weight, damage type...) straight from the name map
    var tags = names.Where(n => n.StartsWith("ItemFilter.") || n.StartsWith("DamageType.") || n.StartsWith("Equipment.")).Distinct().ToList();
    if (tags.Count > 0) props["__Tags"] = new JArray(tags);
    if (props["Icon"] == null)
    {
        var icon = names.FirstOrDefault(n => n.StartsWith("/") && n.Split('/').Last().StartsWith("T_Icon", StringComparison.OrdinalIgnoreCase) && !n.Contains("Counter"))
                   ?? names.FirstOrDefault(n => n.StartsWith("/") && n.Contains("/Icons/") && !n.Contains("Counter"));
        if (icon != null) props["Icon"] = new JObject { ["AssetPathName"] = icon + "." + icon.Split('/').Last() };
    }
}

// "/ScornedWilderness/UI/X.X" -> "RSDragonwilds/Plugins/GameFeatures/ScornedWilderness/Content/UI/X.X"
static string ResolvePluginPath(DefaultFileProvider provider, string objectPath)
{
    var parts = objectPath.TrimStart('/').Split('/', 2);
    if (parts[0] is "Game" or "Engine" || parts.Length < 2) return objectPath;
    var pkg = parts[1].Split('.')[0];
    var hit = provider.Files.Keys.FirstOrDefault(k => k.EndsWith($"/{parts[0]}/Content/{pkg}.uasset", StringComparison.OrdinalIgnoreCase));
    return hit == null ? objectPath : hit.Replace(".uasset", "." + objectPath.Split('.').Last());
}

// CUE4Parse needs a native Detex.dll for BC6/BC7; fall back to the managed BCnEncoder decoder.
static byte[] TexturePng(UTexture2D tex)
{
    try
    {
        var d = tex.Decode();
        if (d != null) return EncodePng(d);
    }
    catch { }
    var mip = tex.GetFirstMip() ?? throw new Exception("no mip");
    var data = mip.BulkData?.Data ?? throw new Exception("no bulk data");
    var fmt = tex.Format switch
    {
        CUE4Parse.UE4.Assets.Exports.Texture.EPixelFormat.PF_BC7 => BCnEncoder.Shared.CompressionFormat.Bc7,
        CUE4Parse.UE4.Assets.Exports.Texture.EPixelFormat.PF_DXT1 => BCnEncoder.Shared.CompressionFormat.Bc1,
        CUE4Parse.UE4.Assets.Exports.Texture.EPixelFormat.PF_DXT5 => BCnEncoder.Shared.CompressionFormat.Bc3,
        CUE4Parse.UE4.Assets.Exports.Texture.EPixelFormat.PF_BC5 => BCnEncoder.Shared.CompressionFormat.Bc5,
        CUE4Parse.UE4.Assets.Exports.Texture.EPixelFormat.PF_BC4 => BCnEncoder.Shared.CompressionFormat.Bc4,
        _ => throw new Exception($"format {tex.Format}")
    };
    var px = new BCnEncoder.Decoder.BcDecoder().DecodeRaw(data, mip.SizeX, mip.SizeY, fmt);
    var bytes = new byte[px.Length * 4];
    for (int i = 0; i < px.Length; i++) { bytes[i * 4] = px[i].r; bytes[i * 4 + 1] = px[i].g; bytes[i * 4 + 2] = px[i].b; bytes[i * 4 + 3] = px[i].a; }
    using var img = SixLabors.ImageSharp.Image.LoadPixelData<SixLabors.ImageSharp.PixelFormats.Rgba32>(bytes, mip.SizeX, mip.SizeY);
    using var ms = new MemoryStream();
    SixLabors.ImageSharp.ImageExtensions.SaveAsPng(img, ms);
    return ms.ToArray();
}
