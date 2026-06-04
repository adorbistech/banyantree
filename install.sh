#!/usr/bin/env bash
# ============================================================
# BanyanTree Installer — macOS and Linux
# ============================================================
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/adorbis/banyantree/main/install.sh | bash
#
# What this does:
#   1. Checks system requirements
#   2. Installs Node.js 20 if needed
#   3. Clones BanyanTree to the right location
#   4. Builds the project
#   5. Adds 'banyan' CLI to PATH
#   6. Registers the runtime daemon (launchd on macOS, systemd on Linux)
#   7. Installs the VS Code extension if VS Code is present
# ============================================================

set -e

# ── Colours ───────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
AMBER='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ── Output helpers ────────────────────────────────────────────
info()    { echo -e "${BLUE}[BANYAN]${NC} $1"; }
success() { echo -e "${GREEN}[BANYAN OK]${NC} $1"; }
warn()    { echo -e "${AMBER}[BANYAN WARN]${NC} $1"; }
error()   { echo -e "${RED}[BANYAN ERR]${NC} $1"; exit 1; }
step()    { echo -e "${BLUE}[BANYAN] ...${NC} $1"; }

# ── Detect OS ─────────────────────────────────────────────────
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM="macos" ;;
  Linux)  PLATFORM="linux" ;;
  *)      error "Unsupported OS: $OS. BanyanTree supports macOS and Linux." ;;
esac

info "BanyanTree Installer"
info "Platform: $PLATFORM ($ARCH)"
info "Persistent Repository Cognition Runtime"
echo ""

# ── Install location ──────────────────────────────────────────
if [ "$PLATFORM" = "macos" ]; then
  INSTALL_DIR="$HOME/Library/Application Support/BanyanTree/runtime"
  DATA_DIR="$HOME/Library/Application Support/BanyanTree"
  BIN_DIR="/usr/local/bin"
else
  INSTALL_DIR="$HOME/.local/share/banyantree/runtime"
  DATA_DIR="$HOME/.config/banyantree"
  BIN_DIR="$HOME/.local/bin"
fi

mkdir -p "$DATA_DIR"
mkdir -p "$BIN_DIR"

# ── Check / install Node.js ───────────────────────────────────
step "Checking Node.js..."

if command -v node &>/dev/null; then
  NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$NODE_VERSION" -ge 20 ]; then
    success "Node.js $(node --version) found."
  else
    warn "Node.js $(node --version) found but v20+ required."
    install_node
  fi
else
  warn "Node.js not found. Installing..."
  install_node
fi

install_node() {
  if [ "$PLATFORM" = "macos" ]; then
    if command -v brew &>/dev/null; then
      step "Installing Node.js via Homebrew..."
      brew install node@20
      brew link --overwrite node@20
    else
      error "Homebrew not found. Please install Node.js 20 from https://nodejs.org then re-run this script."
    fi
  else
    # Linux — use NodeSource
    step "Installing Node.js 20 via NodeSource..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs 2>/dev/null || \
    sudo yum install -y nodejs 2>/dev/null || \
    error "Could not install Node.js automatically. Please install Node.js 20 from https://nodejs.org"
  fi
}

# ── Check git ─────────────────────────────────────────────────
step "Checking git..."
if ! command -v git &>/dev/null; then
  error "git is required. Install it with: brew install git (macOS) or sudo apt install git (Linux)"
fi
success "git $(git --version | awk '{print $3}') found."

# ── Clone or update repository ────────────────────────────────
REPO_URL="https://github.com/adorbistech/banyantree.git"

if [ -d "$INSTALL_DIR/.git" ]; then
  step "Updating existing BanyanTree installation..."
  cd "$INSTALL_DIR"
  git pull origin main
  success "Updated to latest version."
else
  step "Cloning BanyanTree repository..."
  mkdir -p "$(dirname "$INSTALL_DIR")"
  git clone "$REPO_URL" "$INSTALL_DIR"
  success "Repository cloned."
fi

cd "$INSTALL_DIR"

# ── Install dependencies ──────────────────────────────────────
step "Installing dependencies..."
npm install --silent
success "Dependencies installed."

# ── Build ─────────────────────────────────────────────────────
step "Building BanyanTree..."
node build.js
success "Build complete."

# ── Create banyan CLI wrapper ─────────────────────────────────
step "Installing 'banyan' CLI..."

cat > "$BIN_DIR/banyan" << BANYAN_EOF
#!/usr/bin/env bash
node "$INSTALL_DIR/dist-flat/apps/cli/src/index.js" "\$@"
BANYAN_EOF

chmod +x "$BIN_DIR/banyan"

# Add BIN_DIR to PATH if not already there
SHELL_RC=""
if [ -n "$ZSH_VERSION" ] || [ "$SHELL" = "/bin/zsh" ]; then
  SHELL_RC="$HOME/.zshrc"
elif [ -n "$BASH_VERSION" ] || [ "$SHELL" = "/bin/bash" ]; then
  SHELL_RC="$HOME/.bashrc"
fi

if [ -n "$SHELL_RC" ] && ! grep -q "$BIN_DIR" "$SHELL_RC" 2>/dev/null; then
  echo "" >> "$SHELL_RC"
  echo "# BanyanTree" >> "$SHELL_RC"
  echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_RC"
fi

export PATH="$BIN_DIR:$PATH"
success "'banyan' CLI installed."

# ── Register daemon ───────────────────────────────────────────
step "Registering BanyanTree runtime daemon..."

if [ "$PLATFORM" = "macos" ]; then
  PLIST_PATH="$HOME/Library/LaunchAgents/com.adorbis.banyantree.plist"

  cat > "$PLIST_PATH" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.adorbis.banyantree</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(command -v node)</string>
    <string>$INSTALL_DIR/dist-flat/apps/desktop-runtime/src/index.js</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>$DATA_DIR/logs/runtime.log</string>
  <key>StandardErrorPath</key>
  <string>$DATA_DIR/logs/runtime-error.log</string>
</dict>
</plist>
PLIST_EOF

  mkdir -p "$DATA_DIR/logs"
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl load "$PLIST_PATH"
  success "Runtime daemon registered with launchd (starts on login)."

else
  # Linux — systemd user service
  SYSTEMD_DIR="$HOME/.config/systemd/user"
  mkdir -p "$SYSTEMD_DIR"
  mkdir -p "$DATA_DIR/logs"

  cat > "$SYSTEMD_DIR/banyantree.service" << SERVICE_EOF
[Unit]
Description=BanyanTree Cognition Runtime
After=network.target

[Service]
Type=simple
ExecStart=$(command -v node) $INSTALL_DIR/dist-flat/apps/desktop-runtime/src/index.js
Restart=on-failure
RestartSec=10
StandardOutput=append:$DATA_DIR/logs/runtime.log
StandardError=append:$DATA_DIR/logs/runtime-error.log

[Install]
WantedBy=default.target
SERVICE_EOF

  if command -v systemctl &>/dev/null; then
    systemctl --user daemon-reload
    systemctl --user enable banyantree.service
    systemctl --user start banyantree.service
    success "Runtime daemon registered with systemd (starts on login)."
  else
    warn "systemd not available. Start the runtime manually: banyan runtime start"
  fi
fi

# ── MCP server wrapper ────────────────────────────────────────
cat > "$BIN_DIR/banyan-mcp" << MCP_EOF
#!/usr/bin/env bash
node "$INSTALL_DIR/dist-flat/services/mcp-server/src/index.js" "\$@"
MCP_EOF
chmod +x "$BIN_DIR/banyan-mcp"

# ── Install VS Code extension if VS Code is present ───────────
step "Checking for VS Code..."
if command -v code &>/dev/null; then
  step "Building VS Code extension..."
  cd "$INSTALL_DIR/apps/vscode-extension"
  npm install --silent 2>/dev/null || true
  npm run build 2>/dev/null || true

  if command -v vsce &>/dev/null; then
    vsce package --no-dependencies 2>/dev/null && \
    code --install-extension banyantree-*.vsix 2>/dev/null && \
    success "VS Code extension installed." || \
    warn "VS Code extension build failed. Install manually from the extension marketplace later."
  else
    warn "vsce not found. VS Code extension not packaged. Run: npm install -g @vscode/vsce && vsce package"
  fi
else
  info "VS Code not detected. Install the extension manually after installing VS Code."
fi

cd "$INSTALL_DIR"

# ── Final output ──────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
success "BanyanTree installed successfully."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
info "Installation directory: $INSTALL_DIR"
info "Data directory:         $DATA_DIR"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Restart your terminal (or run: source $SHELL_RC)"
echo ""
echo "  2. Initialise a repository:"
echo "     banyan init /path/to/your/project"
echo ""
echo "  3. Fill in the seed document:"
echo "     .banyan/seed.md  (inside your project)"
echo ""
echo "  4. Connect Claude Code — add this to your project's .mcp.json:"
echo "     { \"mcpServers\": { \"banyantree\": { \"command\": \"banyan-mcp\" } } }"
echo ""
echo "  5. Health check:"
echo "     banyan doctor"
echo ""
info "BanyanTree remembers WHY your code is the way it is."
echo ""
