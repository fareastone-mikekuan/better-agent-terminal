#!/usr/bin/env node
/**
 * Automatic Git portable setup script
 * Downloads Git for Windows portable if not already present
 * Runs automatically after npm install
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const unzipper = require('unzipper');

const GIT_VERSION = '2.48.1';
const DOWNLOAD_URL = `https://github.com/git-for-windows/git/releases/download/v${GIT_VERSION}.windows.1/PortableGit-${GIT_VERSION}-64-bit.7z.exe`;
const PACKAGES_DIR = path.join(__dirname, '..', 'packages');
const GIT_DIR = path.join(PACKAGES_DIR, 'Git');
const DOWNLOAD_FILE = path.join(PACKAGES_DIR, `PortableGit-${GIT_VERSION}-64-bit.7z.exe`);
const GIT_EXE = path.join(GIT_DIR, 'cmd', 'git.exe');

// Only run on Windows
if (process.platform !== 'win32') {
  console.log('⏭️  Skipping Git setup (not Windows)');
  process.exit(0);
}

// Check if Git already exists
if (fs.existsSync(GIT_EXE)) {
  console.log('✅ Git already installed at packages/Git/');
  try {
    const version = execSync(`"${GIT_EXE}" --version`, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    console.log(`   ${version}`);
  } catch (e) {
    // Ignore version check errors
  }
  process.exit(0);
}

console.log('📦 Setting up Git for Better Agent Terminal...');
console.log(`   Version: ${GIT_VERSION}`);
console.log(`   Platform: Windows x64`);

// Create packages directory
if (!fs.existsSync(PACKAGES_DIR)) {
  fs.mkdirSync(PACKAGES_DIR, { recursive: true });
}

// Create Git directory
if (!fs.existsSync(GIT_DIR)) {
  fs.mkdirSync(GIT_DIR, { recursive: true });
}

// Check if download file already exists
if (fs.existsSync(DOWNLOAD_FILE)) {
  console.log('📂 Found existing download, extracting...');
  extractGit();
  return;
}

// Download Git portable
console.log('⬇️  Downloading Git portable (~55 MB)...');
console.log(`   URL: ${DOWNLOAD_URL}`);

const file = fs.createWriteStream(DOWNLOAD_FILE);
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
        extractGit();
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
      extractGit();
    });
  }
}).on('error', handleError);

function extractGit() {
  console.log('📂 Extracting Git portable (self-extracting archive)...');
  
  // Check if file is locked/in use
  try {
    const fd = fs.openSync(DOWNLOAD_FILE, 'r+');
    fs.closeSync(fd);
  } catch (error) {
    if (error.code === 'EBUSY' || error.code === 'EPERM') {
      console.error('❌ Download file is locked by another process');
      console.log('💡 Solutions:');
      console.log('   1. Close any running installers or virus scanners');
      console.log('   2. Delete the file and run npm install again:');
      console.log(`      del "${DOWNLOAD_FILE}"`);
      console.log('   3. Or manually extract:');
      console.log(`      - Run: ${DOWNLOAD_FILE}`);
      console.log(`      - Extract to: ${GIT_DIR}`);
      process.exit(1);
    }
  }
  
  try {
    // Git portable is a self-extracting 7z archive
    // Use -y flag for yes to all, -o for output directory
    // Add quotes around path to handle spaces
    const command = `"${DOWNLOAD_FILE}" -y -o"${GIT_DIR}"`;
    console.log(`   Running: ${command}`);
    execSync(command, { 
      encoding: 'utf8',
      stdio: 'inherit',
      timeout: 120000 // 2 minutes timeout
    });
    console.log('✅ Extraction completed!');
    verifyAndCleanup();
  } catch (error) {
    console.error('❌ Failed to extract Git:', error.message);
    console.log('💡 Alternative solutions:');
    console.log('   1. Manual extraction:');
    console.log(`      - Run: ${DOWNLOAD_FILE}`);
    console.log(`      - Extract to: ${GIT_DIR}`);
    console.log('   2. Delete and retry:');
    console.log(`      del "${DOWNLOAD_FILE}"`);
    console.log('      npm install');
    console.log('   3. Use system Git instead (install from git-scm.com)');
    process.exit(1);
  }
}

function verifyAndCleanup() {
  // Verify installation
  if (fs.existsSync(GIT_EXE)) {
    try {
      const version = execSync(`"${GIT_EXE}" --version`, { 
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      }).trim();
      console.log(`✅ ${version} is ready!`);
      console.log(`   Location: packages/Git/cmd/git.exe`);
    } catch (e) {
      console.log('✅ Git extracted successfully!');
    }
  } else {
    console.error('❌ Error: git.exe not found after extraction');
    console.log('💡 Expected location: packages/Git/cmd/git.exe');
    process.exit(1);
  }
  
  // Clean up downloaded file
  console.log('🧹 Cleaning up...');
  try {
    fs.unlinkSync(DOWNLOAD_FILE);
  } catch (e) {
    console.log('⚠️  Could not delete download file:', DOWNLOAD_FILE);
  }
  console.log('✅ Setup complete!');
}

function handleError(error) {
  console.error('❌ Failed to download Git:', error.message);
  console.log('');
  console.log('💡 Manual installation:');
  console.log(`1. Download: ${DOWNLOAD_URL}`);
  console.log(`2. Extract to: ${GIT_DIR}`);
  console.log(`3. Verify git.exe exists at: packages/Git/cmd/git.exe`);
  process.exit(1);
}
