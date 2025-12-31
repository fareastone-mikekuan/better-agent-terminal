# PowerShell Setup for Better Agent Terminal

This directory contains PowerShell 7.5.4 (Windows x64) for the Better Agent Terminal application.

## Why Include PowerShell?

Including PowerShell ensures that:
- ✅ The terminal works **out of the box** even if PowerShell is not installed on the system
- ✅ Consistent PowerShell version across all deployments
- ✅ No dependency on system-installed PowerShell versions
- ✅ Supports Windows systems without PowerShell 7

## Setup

### Automatic Setup (Default)

PowerShell is **automatically downloaded** when you run `npm install`:

```bash
npm install
```

The setup script (`scripts/setup-powershell.js`) will:
1. Check if PowerShell already exists (skip if present)
2. Download PowerShell 7.5.4 from GitHub (~110MB)
3. Extract it to `packages/PowerShell/`
4. Verify the installation

**This only happens once per machine** - subsequent `npm install` will detect the existing installation and skip the download.

### Manual Setup (Optional)

If automatic setup fails, you can run it manually:

**Using PowerShell script:**
```powershell
./setup-powershell.ps1
```

**Using Node.js script:**
```bash
npm run setup:powershell
```

**Completely manual:**
1. Download [PowerShell-7.5.4-win-x64.zip](https://github.com/PowerShell/PowerShell/releases/download/v7.5.4/PowerShell-7.5.4-win-x64.zip)
2. Extract to `packages/PowerShell/`
3. Verify `packages/PowerShell/pwsh.exe` exists

## Default Configuration

The app is configured to use `packages/PowerShell/pwsh.exe` by default:

- **Shell Type:** Custom
- **Shell Path:** `packages/PowerShell/pwsh.exe` (relative path)

Users can change this in Settings if they prefer to use their system-installed PowerShell.

## File Size

- Download: ~110 MB (compressed)
- Extracted: ~250 MB

## Version

- PowerShell: 7.5.4
- Platform: Windows x64
- Release Date: 2025

## Notes

- This directory is added to `.gitignore` (binary files should not be committed)
- Each developer/user needs to run `setup-powershell.ps1` after cloning
- The setup script is idempotent (safe to run multiple times)

## License

PowerShell is licensed under the MIT License. See [PowerShell License](https://github.com/PowerShell/PowerShell/blob/master/LICENSE.txt) for details.
