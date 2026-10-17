# Shared helpers for the Códex scripts.
$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
$ConfigFile = Join-Path $RepoRoot 'config.local.json'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Yellow }
function Write-Ok($msg) { Write-Host "    $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "    $msg" -ForegroundColor Gray }

function Get-CodexConfig {
    if (Test-Path $ConfigFile) { return Get-Content $ConfigFile -Raw | ConvertFrom-Json }
    return [pscustomobject]@{ gamePath = $null }
}

function Save-CodexConfig($cfg) {
    $cfg | ConvertTo-Json | Set-Content -Path $ConfigFile -Encoding UTF8
}

function Test-GamePath($p) {
    return $p -and (Test-Path (Join-Path $p 'RSDragonwilds\Content\Paks\RSDragonwilds-Windows.utoc'))
}

# Looks for RSDragonwilds in every Steam library.
function Find-GamePath {
    $cfg = Get-CodexConfig
    if (Test-GamePath $cfg.gamePath) { return $cfg.gamePath }
    $steam = $null
    foreach ($key in 'HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam') {
        try {
            $v = Get-ItemProperty $key -ErrorAction Stop
            if ($v.SteamPath) { $steam = $v.SteamPath; break }
            if ($v.InstallPath) { $steam = $v.InstallPath; break }
        } catch { }
    }
    $libs = @()
    if ($steam) {
        $libs += $steam
        $vdf = Join-Path $steam 'steamapps\libraryfolders.vdf'
        if (Test-Path $vdf) {
            foreach ($m in [regex]::Matches((Get-Content $vdf -Raw), '"path"\s+"([^"]+)"')) { $libs += $m.Groups[1].Value -replace '\\\\', '\' }
        }
    }
    foreach ($lib in ($libs | Select-Object -Unique)) {
        $p = Join-Path $lib 'steamapps\common\RSDragonwilds'
        if (Test-GamePath $p) { return (Resolve-Path $p).Path }
    }
    return $null
}

# Runs a native program without PowerShell 5.1 turning its stderr into terminating errors.
# Returns the exit code; output is hidden unless -Show.
function Invoke-Native([string]$Exe, [string[]]$ArgList, [switch]$Show) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        if ($Show) { & $Exe @ArgList 2>&1 | ForEach-Object { Write-Info "$_" } }
        else { & $Exe @ArgList 2>&1 | Out-Null }
        return $LASTEXITCODE
    } finally { $ErrorActionPreference = $old }
}

function Get-Win64Path($gamePath) { return Join-Path $gamePath 'RSDragonwilds\Binaries\Win64' }
