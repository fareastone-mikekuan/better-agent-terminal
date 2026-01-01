#!/usr/bin/env node
/**
 * Automatic PowerShell setup script
 * Downloads PowerShell 7.5.4 if not already present
 * Runs automatically after npm install
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const unzipper = require('unzipper');

const POWERSHELL_VERSION = '7.5.4';
const DOWNLOAD_URL = `https://github.com/PowerShell/PowerShell/releases/download/v${POWERSHELL_VERSION}/PowerShell-${POWERSHELL_VERSION}-win-x64.zip`;
const PACKAGES_DIR = path.join(__dirname, '..', 'packages');
const POWERSHELL_DIR = path.join(PACKAGES_DIR, 'PowerShell');
const ZIP_FILE = path.join(PACKAGES_DIR, `PowerShell-${POWERSHELL_VERSION}-win-x64.zip`);
const PWSH_EXE = path.join(POWERSHELL_DIR, 'pwsh.exe');

// Only run on Windows
if (process.platform !== 'win32') {
  console.log('⏭️  Skipping PowerShell setup (not Windows)');
  process.exit(0);
}

// Check if PowerShell already exists
if (fs.existsSync(PWSH_EXE)) {
  console.log('✅ PowerShell already installed at packages/PowerShell/');
  try {
    const version = execSync(`"${PWSH_EXE}" -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"`, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    console.log(`   Version: ${version}`);
  } catch (e) {
    // Ignore version check errors
  }
  process.exit(0);
}

console.log('📦 Setting up PowerShell for Better Agent Terminal...');
console.log(`   Version: ${POWERSHELL_VERSION}`);
console.log(`   Platform: Windows x64`);

// Create packages directory
if (!fs.existsSync(PACKAGES_DIR)) {
  fs.mkdirSync(PACKAGES_DIR, { recursive: true });
}

// Download PowerShell
console.log('⬇️  Downloading PowerShell (~110 MB)...');
console.log(`   URL: ${DOWNLOAD_URL}`);

const file = fs.createWriteStream(ZIP_FILE);
let downloadedBytes = 0;
let totalBytes = 0;
let lastProgress = -1;

https.get(DOWNLOAD_URL, (response) => {
  if (response.statusCode === 302 || response.statusCode === 301) {
    // Follow redirect
    https.get(response.headers.location, (redirectResponse) => {
      totalBytes = parseInt(redirectResponse.headers['content-length'], 10);
      
      redirectResponse.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const progress = Math.floor((downloadedBytes / totalBytes) * 100);
        if (progress !== lastProgress && progress % 10 === 0) {
          console.log(`   Progress: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB / ${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
          lastProgress = progress;
        }
      });
      
      redirectResponse.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('✅ Download completed!');
        extractPowerShell();
      });
    }).on('error', handleError);
  } else {
    totalBytes = parseInt(response.headers['content-length'], 10);
    
    response.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      const progress = Math.floor((downloadedBytes / totalBytes) * 100);
      if (progress !== lastProgress && progress % 10 === 0) {
        console.log(`   Progress: ${progress}% (${(downloadedBytes / 1024 / 1024).toFixed(1)} MB / ${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
        lastProgress = progress;
      }
    });
    
    response.pipe(file);
    
    file.on('finish', () => {
      file.close();
      console.log('✅ Download completed!');
      extractPowerShell();
    });
  }
}).on('error', handleError);

function extractPowerShell() {
  console.log('📂 Extracting PowerShell...');
  
  try {
    // Use unzipper to extract (more reliable than PowerShell's Expand-Archive)
    fs.createReadStream(ZIP_FILE)
      .pipe(unzipper.Extract({ path: POWERSHELL_DIR }))
      .on('close', () => {
        console.log('✅ Extraction completed!');
        verifyAndCleanup();
      })
      .on('error', (error) => {
        console.error('❌ Failed to extract PowerShell:', error.message);
        process.exit(1);
      });
  } catch (error) {
    console.error('❌ Failed to extract PowerShell:', error.message);
    process.exit(1);
  }
}

function verifyAndCleanup() {
  // Verify installation
  if (fs.existsSync(PWSH_EXE)) {
    try {
      const version = execSync(`"${PWSH_EXE}" -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      console.log(`✅ PowerShell ${version} is ready!`);
      console.log(`   Location: packages/PowerShell/pwsh.exe`);
    } catch (e) {
      console.log('✅ PowerShell extracted successfully!');
    }
  } else {
    console.error('❌ Error: pwsh.exe not found after extraction');
    process.exit(1);
  }
  
  // Clean up zip file
  console.log('🧹 Cleaning up...');
  fs.unlinkSync(ZIP_FILE);
  console.log('✅ Setup complete!');
}

function handleError(error) {
  console.error('❌ Failed to download PowerShell:', error.message);
  console.error('');
  console.error('You can manually download and extract PowerShell:');
  console.error(`1. Download: ${DOWNLOAD_URL}`);
  console.error(`2. Extract to: ${POWERSHELL_DIR}`);
  console.error('3. Run: npm install');
  
  // Clean up partial download
  if (fs.existsSync(ZIP_FILE)) {
    fs.unlinkSync(ZIP_FILE);
  }
  
  process.exit(1);
}
