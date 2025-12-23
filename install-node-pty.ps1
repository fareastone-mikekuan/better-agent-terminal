# Install node-pty for Better Agent Terminal
# This script will check for Visual Studio Build Tools and install node-pty

Write-Host "Checking for Visual Studio Build Tools..." -ForegroundColor Cyan

# Check if Visual Studio Build Tools is installed
$vsWhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$hasBuildTools = $false

if (Test-Path $vsWhere) {
    $vsPath = & $vsWhere -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if ($vsPath) {
        Write-Host "✓ Visual Studio Build Tools found at: $vsPath" -ForegroundColor Green
        $hasBuildTools = $true
    }
}

if (-not $hasBuildTools) {
    Write-Host "✗ Visual Studio Build Tools not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "To install node-pty, you need Visual Studio Build Tools:" -ForegroundColor Yellow
    Write-Host "1. Download from: https://aka.ms/vs/17/release/vs_BuildTools.exe" -ForegroundColor White
    Write-Host "2. Run the installer and select 'Desktop development with C++'" -ForegroundColor White
    Write-Host "3. After installation, restart PowerShell and run this script again" -ForegroundColor White
    Write-Host ""
    
    $download = Read-Host "Download now? (Y/N)"
    if ($download -eq 'Y' -or $download -eq 'y') {
        Start-Process "https://aka.ms/vs/17/release/vs_BuildTools.exe"
    }
    exit 1
}

# Install node-pty
Write-Host ""
Write-Host "Installing node-pty..." -ForegroundColor Cyan

$env:PATH = "C:\home\node-v24.12.0-win-x64;$env:PATH"

try {
    npm install --save-optional node-pty
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✓ node-pty installed successfully" -ForegroundColor Green
        Write-Host ""
        Write-Host "Rebuilding for Electron..." -ForegroundColor Cyan
        npx electron-rebuild
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "✓ Rebuild complete!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Installation complete! Restart Better Agent Terminal to use node-pty." -ForegroundColor Green
            Write-Host "You will now have full support for:" -ForegroundColor White
            Write-Host "  • Backspace and Delete keys" -ForegroundColor White
            Write-Host "  • Arrow keys for command history" -ForegroundColor White
            Write-Host "  • Terminal resizing" -ForegroundColor White
            Write-Host "  • Better color support" -ForegroundColor White
        } else {
            Write-Host "✗ Electron rebuild failed" -ForegroundColor Red
            Write-Host "Try running manually: npx electron-rebuild" -ForegroundColor Yellow
        }
    } else {
        Write-Host "✗ Failed to install node-pty" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Error: $_" -ForegroundColor Red
}
