# ============================================================
# BanyanTree Installer â€” Windows PowerShell
# ============================================================
# Usage (paste in PowerShell):
#   irm https://raw.githubusercontent.com/adorbis/banyantree/main/install.ps1 | iex
#
# Or download and run:
#   powershell -ExecutionPolicy Bypass -File install.ps1
#
# What this does:
#   1. Checks system requirements
#   2. Installs Node.js 20 if needed (via winget)
#   3. Clones BanyanTree to AppData
#   4. Builds the project
#   5. Adds 'banyan' CLI to user PATH
#   6. Registers runtime as a scheduled task (starts on login)
#   7. Installs VS Code extension if VS Code is present
# ============================================================

$ErrorActionPreference = "Continue"

# â”€â”€ Output helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Info($msg)    { Write-Host "[BANYAN] $msg" -ForegroundColor Cyan }
function Ok($msg)      { Write-Host "[BANYAN OK] $msg" -ForegroundColor Green }
function Warn($msg)    { Write-Host "[BANYAN WARN] $msg" -ForegroundColor Yellow }
function Step($msg)    { Write-Host "[BANYAN] ... $msg" -ForegroundColor Cyan }
function Err($msg)     { Write-Host "[BANYAN ERR] $msg" -ForegroundColor Red; exit 1 }

Info "BanyanTree Installer for Windows"
Info "Persistent Repository Cognition Runtime"
Info "Version: 0.1.0"
Write-Host ""

# â”€â”€ Install paths â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$AppData     = $env:APPDATA
$InstallDir  = Join-Path $AppData "BanyanTree\runtime"
$DataDir     = Join-Path $AppData "BanyanTree"
$LogDir      = Join-Path $DataDir "logs"
$BinDir      = Join-Path $AppData "BanyanTree\bin"

New-Item -ItemType Directory -Force -Path $DataDir  | Out-Null
New-Item -ItemType Directory -Force -Path $LogDir   | Out-Null
New-Item -ItemType Directory -Force -Path $BinDir   | Out-Null

# â”€â”€ Check / install Node.js â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Step "Checking Node.js..."

$nodeInstalled = $false
try {
  $nodeVersion = (node --version 2>$null).TrimStart('v').Split('.')[0]
  if ([int]$nodeVersion -ge 20) {
    Ok "Node.js $(node --version) found."
    $nodeInstalled = $true
  } else {
    Warn "Node.js $(node --version) found but v20+ required. Upgrading..."
  }
} catch {
  Warn "Node.js not found. Installing..."
}

if (-not $nodeInstalled) {
  # Try winget first (Windows 11 / modern Windows 10)
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Step "Installing Node.js 20 via winget..."
    winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
    # Refresh PATH
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    Ok "Node.js installed."
  } else {
    Err "Node.js not found and winget is not available.`nPlease install Node.js 20 from https://nodejs.org then re-run this script."
  }
}

# â”€â”€ Check git â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Step "Checking git..."
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  if (Get-Command winget -ErrorAction SilentlyContinue) {
    Step "Installing git via winget..."
    winget install Git.Git --accept-source-agreements --accept-package-agreements
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
  } else {
    Err "git is required. Install from https://git-scm.com then re-run."
  }
}
Ok "git found."

# â”€â”€ Clone or update repository â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
$RepoUrl = "https://github.com/adorbistech/banyantree.git"

if (Test-Path (Join-Path $InstallDir ".git")) {
  Step "Updating existing BanyanTree installation..."
  Set-Location $InstallDir
  git pull origin main
  Ok "Updated to latest version."
} else {
  Step "Cloning BanyanTree repository..."
  $ParentDir = Split-Path $InstallDir -Parent
  New-Item -ItemType Directory -Force -Path $ParentDir | Out-Null
  git clone $RepoUrl $InstallDir
  Ok "Repository cloned to: $InstallDir"
}

Set-Location $InstallDir

# â”€â”€ Install dependencies â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Step "Installing dependencies (this may take 1-2 minutes)..."
npm install --silent
Ok "Dependencies installed."

# â”€â”€ Build â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Step "Building BanyanTree..."
node build.js
Ok "Build complete."

# â”€â”€ Create banyan CLI wrapper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Step "Installing 'banyan' CLI..."

$CliScript = Join-Path $BinDir "banyan.cmd"
@"
@echo off
node "$InstallDir\dist-flat\apps\cli\src\index.js" %*
"@ | Set-Content -Path $CliScript -Encoding ASCII

$McpScript = Join-Path $BinDir "banyan-mcp.cmd"
@"
@echo off
node "$InstallDir\dist-flat\services\mcp-server\src\index.js" %*
"@ | Set-Content -Path $McpScript -Encoding ASCII

# Add BinDir to user PATH if not already there
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$BinDir*") {
  [Environment]::SetEnvironmentVariable("Path", "$UserPath;$BinDir", "User")
  $env:Path += ";$BinDir"
  Ok "'banyan' added to PATH."
} else {
  Ok "'banyan' already in PATH."
}

# â”€â”€ Register runtime as Windows Scheduled Task â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Step "Registering BanyanTree runtime (starts on login)..."

$TaskName = "BanyanTree Runtime"
$NodePath = (Get-Command node).Source
$RuntimeScript = "$InstallDir\dist-flat\apps\desktop-runtime\src\index.js"

# Remove existing task if present
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

$Action = New-ScheduledTaskAction `
  -Execute $NodePath `
  -Argument "`"$RuntimeScript`"" `
  -WorkingDirectory $InstallDir

$Trigger  = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description "BanyanTree persistent cognition runtime daemon" `
  -RunLevel Limited | Out-Null

# Start it now
Start-ScheduledTask -TaskName $TaskName
Ok "Runtime daemon registered and started."

# â”€â”€ Install VS Code extension if VS Code is present â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Step "Checking for VS Code..."
if (Get-Command code -ErrorAction SilentlyContinue) {
  Step "Building VS Code extension..."
  Set-Location "$InstallDir\apps\vscode-extension"
  npm install --silent 2>$null
  npm run build 2>$null

  if (Get-Command vsce -ErrorAction SilentlyContinue) {
    vsce package --no-dependencies 2>$null
    $vsixFile = Get-ChildItem -Path . -Filter "*.vsix" | Select-Object -First 1
    if ($vsixFile) {
      code --install-extension $vsixFile.FullName
      Ok "VS Code extension installed."
    }
  } else {
    Warn "vsce not found. Install with: npm install -g @vscode/vsce"
    Warn "Then run: cd `"$InstallDir\apps\vscode-extension`" && vsce package && code --install-extension *.vsix"
  }
} else {
  Info "VS Code not detected. Install the extension manually after installing VS Code."
}

Set-Location $InstallDir

# â”€â”€ Final output â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
Write-Host ""
Write-Host "â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”" -ForegroundColor Green
Ok "BanyanTree installed successfully."
Write-Host "â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”" -ForegroundColor Green
Write-Host ""
Info "Installation: $InstallDir"
Info "Data:         $DataDir"
Info "Logs:         $LogDir"
Write-Host ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Host ""
Write-Host "  1. Open a NEW PowerShell window (so PATH takes effect)" -ForegroundColor White
Write-Host ""
Write-Host "  2. Initialise a repository:" -ForegroundColor White
Write-Host "     banyan init C:\path\to\your\project" -ForegroundColor Yellow
Write-Host ""
Write-Host "  3. Fill in the seed document:" -ForegroundColor White
Write-Host "     .banyan\seed.md  (inside your project)" -ForegroundColor Yellow
Write-Host ""
Write-Host "  4. Connect Claude Code â€” your project's .mcp.json:" -ForegroundColor White
Write-Host '     { "mcpServers": { "banyantree": { "command": "banyan-mcp" } } }' -ForegroundColor Yellow
Write-Host ""
Write-Host "  5. Health check:" -ForegroundColor White
Write-Host "     banyan doctor" -ForegroundColor Yellow
Write-Host ""
Info "BanyanTree remembers WHY your code is the way it is."
Write-Host ""
