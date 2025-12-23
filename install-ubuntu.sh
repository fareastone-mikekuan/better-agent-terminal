#!/bin/bash
# Install node-pty on Ubuntu/Debian

echo "Installing build dependencies for node-pty..."

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
    apt-get update
    apt-get install -y build-essential python3 make g++
else
    echo "Installing system packages (may require sudo password)..."
    sudo apt-get update
    sudo apt-get install -y build-essential python3 make g++
fi

echo ""
echo "Build dependencies installed ✓"
echo ""
echo "Installing node-pty..."

# Install node-pty
npm install --save-optional node-pty

if [ $? -eq 0 ]; then
    echo "✓ node-pty installed successfully"
    echo ""
    echo "Rebuilding for Electron..."
    npx electron-rebuild
    
    if [ $? -eq 0 ]; then
        echo "✓ Installation complete!"
        echo ""
        echo "You now have full terminal support:"
        echo "  • Backspace and Delete keys"
        echo "  • Arrow keys for command history"
        echo "  • Terminal resizing"
        echo "  • Better color and Unicode support"
        echo ""
        echo "Restart the application to use node-pty."
    else
        echo "✗ Electron rebuild failed"
        echo "Try: npx electron-rebuild"
    fi
else
    echo "✗ Failed to install node-pty"
fi
