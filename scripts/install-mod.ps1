# Instala o UE4SS (oficial, GitHub UE4SS-RE) e o mod CraftCodex no jogo.
param([string]$GamePath, [switch]$ReinstallUE4SS)
. (Join-Path $PSScriptRoot 'common.ps1')
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

if (-not (Test-GamePath $GamePath)) { $GamePath = Find-GamePath }
if (-not (Test-GamePath $GamePath)) { throw "Jogo não encontrado. Rode o Instalar.cmd primeiro." }
$win64 = Get-Win64Path $GamePath
if (Get-Process 'RSDragonwilds-Win64-Shipping' -ErrorAction SilentlyContinue) { throw "Feche o jogo antes de instalar o mod." }

Write-Step "Instalando o mod ao vivo"
$ue4ss = Join-Path $win64 'ue4ss'
$fresh = $false
if ($ReinstallUE4SS -or -not (Test-Path (Join-Path $ue4ss 'UE4SS.dll'))) {
    # UE 5.6 precisa da build "experimental-latest" do UE4SS.
    $rel = Invoke-RestMethod 'https://api.github.com/repos/UE4SS-RE/RE-UE4SS/releases/tags/experimental-latest' -Headers @{ 'User-Agent' = 'CraftCodex' }
    $asset = $rel.assets | Where-Object { $_.name -match '^UE4SS_v.*\.zip$' } | Select-Object -First 1
    if (-not $asset) { throw "Não achei o pacote do UE4SS no GitHub." }
    $tmp = Join-Path $env:TEMP ('craftcodex-ue4ss-' + [guid]::NewGuid())
    New-Item -ItemType Directory -Force $tmp | Out-Null
    $zip = Join-Path $tmp 'ue4ss.zip'
    Write-Info "Baixando $($asset.name)"
    Invoke-WebRequest $asset.browser_download_url -OutFile $zip -UseBasicParsing
    if ($asset.digest -match '^sha256:(.+)$') {
        if ((Get-FileHash $zip -Algorithm SHA256).Hash -ne $Matches[1]) { throw "Checksum do UE4SS não confere, abortando." }
        Write-Ok "Checksum SHA-256 conferido"
    }
    Expand-Archive $zip -DestinationPath (Join-Path $tmp 'x') -Force
    Copy-Item (Join-Path $tmp 'x\dwmapi.dll') $win64 -Force
    Copy-Item (Join-Path $tmp 'x\ue4ss') $win64 -Recurse -Force
    Remove-Item $tmp -Recurse -Force
    $fresh = $true
    Write-Ok "UE4SS instalado"
} else {
    Write-Info "UE4SS já instalado, mantendo"
}
# se o mod estava desativado pelo script, reativa
if (Test-Path (Join-Path $win64 'dwmapi.dll.off')) { Move-Item (Join-Path $win64 'dwmapi.dll.off') (Join-Path $win64 'dwmapi.dll') -Force }

$mods = Join-Path $ue4ss 'Mods'
$dst = Join-Path $mods 'CraftCodex'
New-Item -ItemType Directory -Force $dst | Out-Null
Copy-Item (Join-Path $RepoRoot 'mod\CraftCodex\*') $dst -Recurse -Force

# mods.txt / mods.json: numa instalação nova só o CraftCodex fica ligado (desliga console/cheats padrão).
$modsTxt = Join-Path $mods 'mods.txt'
if (Test-Path $modsTxt) {
    $lines = Get-Content $modsTxt | Where-Object { $_ -notmatch '^\s*CraftCodex\s*:' }
    if ($fresh) { $lines = $lines | ForEach-Object { if ($_ -match '^\s*(\w+)\s*:\s*1\s*$' -and $Matches[1] -ne 'Keybinds') { "$($Matches[1]) : 0" } else { $_ } } }
    $out = @(); $added = $false
    foreach ($l in $lines) { if (-not $added -and $l -match '^\s*;.*Keybinds|^\s*Keybinds\s*:') { $out += 'CraftCodex : 1'; $added = $true }; $out += $l }
    if (-not $added) { $out += 'CraftCodex : 1' }
    Set-Content $modsTxt $out -Encoding ascii
}
$modsJson = Join-Path $mods 'mods.json'
if (Test-Path $modsJson) {
    $list = @(Get-Content $modsJson -Raw | ConvertFrom-Json | Where-Object { $_.mod_name -ne 'CraftCodex' })
    if ($fresh) { foreach ($m in $list) { $m.mod_enabled = ($m.mod_name -eq 'Keybinds') } }
    $list += [pscustomobject]@{ mod_name = 'CraftCodex'; mod_enabled = $true }
    ConvertTo-Json @($list) | Set-Content $modsJson -Encoding UTF8
}
New-Item -ItemType Directory -Force (Join-Path $env:LOCALAPPDATA 'RSDragonwilds\Saved\CraftCodex') | Out-Null
Write-Ok "Mod CraftCodex instalado em $dst"
