#!/bin/bash
set -euo pipefail

echo ">>> Installing workspace-mcp ..."

# Go version check
GO_VERSION=$(go version 2>/dev/null | grep -oP 'go\K[0-9]+\.[0-9]+' | head -1 || echo "0.0")
if [ "$(printf '%s\n' "1.22" "$GO_VERSION" | sort -V | head -1)" != "1.22" ]; then
  echo "Error: Go >= 1.22 required (found $GO_VERSION)"
  exit 1
fi

# Build
echo "Building..."
go build -o workspace-mcp .

# Install
INSTALL_DIR="${1:-/usr/local/bin}"
mkdir -p "$INSTALL_DIR"
cp workspace-mcp "$INSTALL_DIR/"
chmod +x "$INSTALL_DIR/workspace-mcp"

# Config template
CONFIG_DIR="${HOME}/.workspace-mcp"
mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_DIR/projects.yaml" ]; then
  cp projects.yaml "$CONFIG_DIR/projects.yaml"
  echo "Config created at $CONFIG_DIR/projects.yaml"
else
  echo "Config already exists at $CONFIG_DIR/projects.yaml"
fi

echo ">>> Done!"
echo ""
echo "Usage:"
echo "  workspace-mcp          # start MCP server"
echo "  Config: $CONFIG_DIR/projects.yaml"
echo ""
echo "Codeg MCP settings:"
echo '  Server ID: workspace'
echo '  Config: {"type":"stdio","command":"'"$INSTALL_DIR"'/workspace-mcp","args":[]}'
