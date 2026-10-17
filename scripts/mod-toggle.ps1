# Liga/desliga o UE4SS (e o mod CraftCodex) renomeando o dwmapi.dll. Desligado = jogo 100% original.
param([ValidateSet('on', 'off')][string]$State)
. (Join-Path $PSScriptRoot 'common.ps1')

$game = Find-GamePath
if (-not $game) { throw "Jogo não encontrado. Rode o Instalar.cmd primeiro." }
if (Get-Process 'RSDragonwilds-Win64-Shipping' -ErrorAction SilentlyContinue) { Write-Host "Feche o jogo antes." -ForegroundColor Red; exit 1 }
$win64 = Get-Win64Path $game
$on = Join-Path $win64 'dwmapi.dll'
$off = Join-Path $win64 'dwmapi.dll.off'

if ($State -eq 'off') {
    if (Test-Path $on) { Move-Item $on $off -Force; Write-Host "Mod DESATIVADO: o jogo abre 100% original." -ForegroundColor Green }
    else { Write-Host "O mod já estava desativado." }
} else {
    if (Test-Path $off) { Move-Item $off $on -Force; Write-Host "Mod ATIVADO." -ForegroundColor Green }
    elseif (Test-Path $on) { Write-Host "O mod já estava ativado." }
    else { Write-Host "UE4SS não está instalado. Rode: scripts\install-mod.ps1" -ForegroundColor Yellow }
}
