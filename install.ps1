# BanyanTree Installer for Windows PowerShell
# Usage: irm https://raw.githubusercontent.com/adorbistech/banyantree/main/install.ps1 | iex

$RepoUrl    = "https://github.com/adorbistech/banyantree.git"
$AppData    = $env:APPDATA
$InstallDir = Join-Path $AppData "BanyanTree\runtime"
$DataDir    = Join-Path $AppData "BanyanTree"
$LogDir     = Join-Path $DataDir "logs"
$BinDir     = Join-Path $AppData "BanyanTree\bin"

function Info($m)  { Write-Host "[BANYAN] $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "[BANYAN OK] $m" -ForegroundColor Green }
function Warn($m)  { Write-Host "[BANYAN WARN] $m" -ForegroundColor Yellow }
function Step($m)  { Write-Host "[BANYAN] ... $m" -ForegroundColor Cyan }
function Err($m)   { Write-Host "[BANYAN ERR] $m" -ForegroundColor Red; exit 1 }

Info "BanyanTree Installer for Windows"
Info "Persistent Repository Cognition Runtime"
Info "Version: 0.1.0"
Write-Host ""

New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir  | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir  | Out-Null

# Check Node.js
Step "Checking Node.js..."
$nodeOk = $false
try {
  $v = (node --version 2>$null).TrimStart('v').Split('.')[0]
  if ([int]$v -ge 20) { Ok "Node.js $(node --version) found."; $nodeOk = $true }
  else { Warn "Node.js $(node --version) is below v20." }
} catch { Warn "Node.js not found." }

if (-not $nodeOk) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Step "Installing Node.js 20 via winget..."
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Ok "Node.js installed."
  } else {
    Err "Please install Node.js 20 from https://nodejs.org then re-run."
  }
}

# Check git
Step "Checking git..."
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    winget install Git.Git --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  } else { Err "git is required. Install from https://git-scm.com" }
}
Ok "git found."

# Clone or update
if (Test-Path (Join-Path $InstallDir ".git")) {
  Step "Updating existing installation..."
  Set-Location $InstallDir
  git pull origin main
  Ok "Updated."
} else {
  Step "Cloning BanyanTree..."
  New-Item -ItemType Directory -Force -Path (Split-Path $InstallDir -Parent) | Out-Null
  git clone $RepoUrl $InstallDir
  if (-not (Test-Path $InstallDir)) { Err "Clone failed. Check your internet connection." }
  Ok "Cloned to: $InstallDir"
}

Set-Location $InstallDir

# Install and build
Step "Installing dependencies..."
npm install --silent
Ok "Dependencies installed."

Step "Building BanyanTree..."
node build.cjs
Ok "Build complete."

# Create CLI wrappers
Step "Installing banyan CLI..."

$cliContent = "@echo off`r`nnode `"$InstallDir\dist-flat\apps\cli\src\index.js`" %*"
[System.IO.File]::WriteAllText((Join-Path $BinDir "banyan.cmd"), $cliContent, [System.Text.Encoding]::ASCII)

$mcpContent = "@echo off`r`nnode `"$InstallDir\dist-flat\services\mcp-server\src\index.js`" %*"
[System.IO.File]::WriteAllText((Join-Path $BinDir "banyan-mcp.cmd"), $mcpContent, [System.Text.Encoding]::ASCII)

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$BinDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$UserPath;$BinDir", "User")
  $env:Path += ";$BinDir"
  Ok "banyan added to PATH."
} else { Ok "banyan already in PATH." }

# Register scheduled task
Step "Registering runtime daemon..."
$TaskName = "BanyanTree Runtime"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action   = New-ScheduledTaskAction -Execute (Get-Command node).Source -Argument "`"$InstallDir\dist-flat\apps\desktop-runtime\src\index.js`"" -WorkingDirectory $InstallDir
$Trigger  = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 0) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "BanyanTree cognition runtime" -RunLevel Limited | Out-Null
Start-ScheduledTask -TaskName $TaskName
Ok "Runtime daemon registered and started."

# VS Code extension
Step "Checking for VS Code..."
if (Get-Command code -ErrorAction SilentlyContinue) {
  Set-Location "$InstallDir\apps\vscode-extension"
  npm install --silent 2>$null
  npm run build 2>$null
  if (Get-Command vsce -ErrorAction SilentlyContinue) {
    vsce package --no-dependencies 2>$null
    $vsix = Get-ChildItem -Filter "*.vsix" | Select-Object -First 1
    if ($vsix) { code --install-extension $vsix.FullName; Ok "VS Code extension installed." }
  } else { Warn "Run: npm install -g @vscode/vsce then re-run installer." }
} else { Info "VS Code not detected. Install it then re-run." }

Set-Location $InstallDir

Write-Host ""
Ok "BanyanTree installed successfully."
Write-Host ""
Info "Installation: $InstallDir"
Info "Data:         $DataDir"
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host "  1. Open a NEW PowerShell window" -ForegroundColor White
Write-Host "  2. banyan init C:\path\to\your\project" -ForegroundColor Yellow
Write-Host "  3. Fill in .banyan\seed.md" -ForegroundColor Yellow
Write-Host "  4. banyan doctor" -ForegroundColor Yellow
Write-Host ""
Info "BanyanTree remembers WHY your code is the way it is."
