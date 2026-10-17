# Instalador do Códex de Criação.
# Extrai os dados do SEU jogo instalado, instala o app (Electron) e, opcionalmente, o mod ao vivo (UE4SS).
param(
    [string]$GamePath,
    [switch]$SkipMod,
    [switch]$WithMod,
    [switch]$NoShortcut
)
. (Join-Path $PSScriptRoot 'common.ps1')
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "Códex de Criação - instalador" -ForegroundColor Cyan

# ------------------------------------------------------------------ 1. jogo
Write-Step "Procurando o RuneScape: Dragonwilds"
if (-not (Test-GamePath $GamePath)) { $GamePath = Find-GamePath }
while (-not (Test-GamePath $GamePath)) {
    $GamePath = (Read-Host "    Não encontrei o jogo. Cole a pasta de instalação (ex.: C:\Steam\steamapps\common\RSDragonwilds)").Trim('"', ' ')
}
$cfg = Get-CodexConfig
$cfg | Add-Member -NotePropertyName gamePath -NotePropertyValue $GamePath -Force
Save-CodexConfig $cfg
Write-Ok "Jogo: $GamePath"

# ------------------------------------------------------------------ 2. Node.js
Write-Step "Verificando Node.js"
$nodeOk = $false
if (Get-Command node -ErrorAction SilentlyContinue) { $nodeOk = [int](((& node --version) -replace '^v', '').Split('.')[0]) -ge 20 }
if (-not $nodeOk) {
    Write-Info "O Node.js 20+ é necessário (https://nodejs.org)."
    if ((Get-Command winget -ErrorAction SilentlyContinue) -and ((Read-Host "    Instalar o Node.js LTS agora com o winget? (s/n)") -match '^[sSyY]')) {
        Invoke-Native 'winget' @('install', '--id', 'OpenJS.NodeJS.LTS', '-e', '--accept-source-agreements', '--accept-package-agreements') -Show | Out-Null
        $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    }
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Instale o Node.js LTS em https://nodejs.org e rode o instalador de novo." }
}
Write-Ok "Node.js $(& node --version)"

# ------------------------------------------------------------------ 3. .NET 10 SDK (local, só para o extrator)
Write-Step "Preparando o extrator (.NET 10)"
$dotnet = $null
if ((Get-Command dotnet -ErrorAction SilentlyContinue) -and ((& dotnet --list-sdks 2>$null) -match '^10\.')) { $dotnet = (Get-Command dotnet).Source }
$localDotnet = Join-Path $RepoRoot '.dotnet\dotnet.exe'
if (-not $dotnet -and (Test-Path $localDotnet)) { $dotnet = $localDotnet }
if (-not $dotnet) {
    Write-Info "Baixando o .NET 10 SDK para a pasta .dotnet do projeto (não mexe no sistema)..."
    $di = Join-Path $env:TEMP 'dotnet-install.ps1'
    Invoke-WebRequest 'https://dot.net/v1/dotnet-install.ps1' -OutFile $di -UseBasicParsing
    & $di -Channel 10.0 -InstallDir (Join-Path $RepoRoot '.dotnet') -NoPath | Out-Null
    $dotnet = $localDotnet
}
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
$env:DOTNET_NOLOGO = '1'
if ((Invoke-Native $dotnet @('build', (Join-Path $RepoRoot 'extractor\extractor.csproj'), '-c', 'Release', '-v', 'quiet', '-nologo')) -ne 0) {
    throw "Falha ao compilar o extrator."
}
Write-Ok "Extrator compilado"

# ------------------------------------------------------------------ 4. dados do jogo
Write-Step "Extraindo itens, receitas, textos (PT/EN) e ícones do seu jogo (1-3 min)"
$raw = Join-Path $RepoRoot 'data\raw'
New-Item -ItemType Directory -Force $raw | Out-Null
$usmap = Join-Path $raw 'game.usmap'
if (-not (Test-Path $usmap)) {
    # Mapeamento de classes público (RSDWArchive); itens que ele não cobre são lidos direto dos bytes.
    Invoke-WebRequest 'https://raw.githubusercontent.com/RSDWArchive/RSDWArchive/main/1.0.0.5/usmap/RSDragonwilds-5.6.1-244954+++dominion+hotfix-f6d5f942.usmap' -OutFile $usmap -UseBasicParsing
}
$extract = Join-Path $RepoRoot 'data\extract'
$exe = Join-Path $RepoRoot 'extractor\bin\Release\net10.0\extractor.dll'
$paks = Join-Path $GamePath 'RSDragonwilds\Content\Paks'
if ((Invoke-Native $dotnet @($exe, $paks, $usmap, $extract, 'dump')) -ne 0) { throw "Falha na extração dos dados." }
$uiArgs = @($exe, $paks, $usmap, $extract, 'ui', 'Content/Art/UI/Common/', 'Content/Art/UI/Craft/', 'Content/Art/UI/MainMenu/', 'Content/UI/Fonts/BonaNova', 'Content/UI/Fonts/NotoSans-')
if ((Invoke-Native $dotnet $uiArgs) -ne 0) { throw "Falha ao extrair a interface." }
if ((Invoke-Native 'node' @((Join-Path $RepoRoot 'tools\build_db.js')) -Show) -ne 0) { throw "Falha ao montar a base de dados." }
Invoke-Native $dotnet @('build-server', 'shutdown') | Out-Null  # não deixa processos do compilador prendendo a pasta
Write-Ok "Base de dados pronta"

# ------------------------------------------------------------------ 5. app (Electron)
Write-Step "Instalando o app"
Push-Location (Join-Path $RepoRoot 'app')
try {
    if ((Invoke-Native 'npm.cmd' @('install', '--no-audit', '--no-fund', '--loglevel=error')) -ne 0) { throw "Falha no npm install." }
    if (-not (Test-Path 'node_modules\electron\dist\electron.exe')) { Invoke-Native 'node' @('node_modules\electron\install.js') | Out-Null }
} finally { Pop-Location }
if (-not (Test-Path (Join-Path $RepoRoot 'app\node_modules\electron\dist\electron.exe'))) { throw "Falha ao instalar o Electron." }
Write-Ok "App instalado"

# ------------------------------------------------------------------ 6. mod ao vivo (opcional)
if (-not $SkipMod) {
    $doMod = [bool]$WithMod
    if (-not $doMod) {
        Write-Host ""
        Write-Info "O mod ao vivo (UE4SS + CraftCodex) lê a sessão atual: sua bolsa, equipamento e baús"
        Write-Info "carregados, inclusive no mundo de um amigo. Sem ele, o app usa o último save do seu mundo."
        $doMod = (Read-Host "    Instalar o mod ao vivo? (s/n)") -match '^[sSyY]'
    }
    if ($doMod) { & (Join-Path $PSScriptRoot 'install-mod.ps1') -GamePath $GamePath }
}

# ------------------------------------------------------------------ 7. atalho
if (-not $NoShortcut) {
    Write-Step "Criando atalho na Área de Trabalho"
    $sh = New-Object -ComObject WScript.Shell
    $lnk = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'Códex de Criação.lnk'))
    $lnk.TargetPath = Join-Path $env:WINDIR 'System32\wscript.exe'
    $lnk.Arguments = '"' + (Join-Path $RepoRoot 'Iniciar Codex.vbs') + '"'
    $lnk.WorkingDirectory = $RepoRoot
    $lnk.IconLocation = Join-Path $RepoRoot 'app\ui\assets\icon.ico'
    $lnk.Save()
    Write-Ok "Atalho criado"
}

Write-Host "`nPronto! Abra o 'Códex de Criação' e use F8 dentro do jogo." -ForegroundColor Cyan
