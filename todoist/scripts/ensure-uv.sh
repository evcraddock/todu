#!/bin/bash
set -e

# Check if uv is installed
if command -v uv &> /dev/null; then
    exit 0
fi

echo "📦 Installing uv (Python package manager)..."
echo "This is needed for task management scripts and only happens once."

# Install uv
if ! curl -LsSf https://astral.sh/uv/install.sh | sh 2>/dev/null; then
    echo "⚠️  Automatic installation failed."
    echo "Please install manually: https://docs.astral.sh/uv/getting-started/installation/"
    exit 1
fi

# Add to PATH for this session
export PATH="$HOME/.cargo/bin:$HOME/.local/bin:$PATH"

# Verify installation
if command -v uv &> /dev/null; then
    echo "✅ uv installed successfully"
else
    echo "❌ Failed to install uv. Please run manually: curl -LsSf https://astral.sh/uv/install.sh | sh"
    exit 1
fi
