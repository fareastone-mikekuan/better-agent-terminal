#!/usr/bin/env pwsh
# Setup script to download PowerShell 7.5.4 for the project

$PowerShellVersion = "7.5.4"
$DownloadUrl = "https://github.com/PowerShell/PowerShell/releases/download/v$PowerShellVersion/PowerShell-$PowerShellVersion-win-x64.zip"
$ZipFile = "packages/PowerShell-$PowerShellVersion-win-x64.zip"
$DestinationPath = "packages/PowerShell"

Write-Host "Setting up PowerShell $PowerShellVersion for better-agent-terminal..." -ForegroundColor Cyan

# Create packages directory if it doesn't exist
if (!(Test-Path "packages")) {
    New-Item -ItemType Directory -Path "packages" -Force | Out-Null
}

# Check if PowerShell is already installed
if (Test-Path "$DestinationPath/pwsh.exe") {
    Write-Host "PowerShell already exists at $DestinationPath" -ForegroundColor Green
    $version = & "$DestinationPath/pwsh.exe" -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'
    Write-Host "Current version: $version" -ForegroundColor Green
    
    $response = Read-Host "Do you want to re-download? (y/N)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Host "Setup cancelled." -ForegroundColor Yellow
        exit 0
    }
    
    Write-Host "Removing existing PowerShell..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $DestinationPath
}

# Download PowerShell
Write-Host "Downloading PowerShell $PowerShellVersion from GitHub..." -ForegroundColor Cyan
try {
    $ProgressPreference = 'SilentlyContinue'  # Speed up download
    Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipFile -ErrorAction Stop
    Write-Host "Download completed!" -ForegroundColor Green
} catch {
    Write-Host "Failed to download PowerShell: $_" -ForegroundColor Red
    exit 1
}

# Extract PowerShell
Write-Host "Extracting PowerShell to $DestinationPath..." -ForegroundColor Cyan
try {
    Expand-Archive -Path $ZipFile -DestinationPath $DestinationPath -Force -ErrorAction Stop
    Write-Host "Extraction completed!" -ForegroundColor Green
} catch {
    Write-Host "Failed to extract PowerShell: $_" -ForegroundColor Red
    exit 1
}

# Clean up zip file
Write-Host "Cleaning up..." -ForegroundColor Cyan
Remove-Item $ZipFile -Force

# Verify installation
if (Test-Path "$DestinationPath/pwsh.exe") {
    $version = & "$DestinationPath/pwsh.exe" -NoProfile -Command '$PSVersionTable.PSVersion.ToString()'
    Write-Host "`nSuccess! PowerShell $version is ready at $DestinationPath/pwsh.exe" -ForegroundColor Green
    Write-Host "The application will use this PowerShell by default." -ForegroundColor Green
} else {
    Write-Host "`nError: pwsh.exe not found after extraction!" -ForegroundColor Red
    exit 1
}
