const fs = require('fs');
const path = require('path');

function parseElectronVersionFromPackageJson(pkg) {
  const fromDev = pkg.devDependencies && pkg.devDependencies.electron;
  const fromDeps = pkg.dependencies && pkg.dependencies.electron;
  const raw = fromDev || fromDeps;
  if (!raw) return null;
  // typically "^28.3.3" or "28.3.3"
  const m = String(raw).match(/(\d+\.\d+\.\d+)/);
  return m ? m[1] : null;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyIfMissing(src, dest) {
  if (fs.existsSync(dest)) return false;
  fs.copyFileSync(src, dest);
  return true;
}

(function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  const version = parseElectronVersionFromPackageJson(pkg);
  if (!version) {
    console.warn('[ensure-electron-cache] Could not determine Electron version from package.json');
    process.exit(0);
  }

  // electron-builder/electron-download expects this filename
  const zipName = `electron-v${version}-win32-x64.zip`;

  // User-provided zip location (current convention)
  const bundledZip = path.join(projectRoot, 'packages', zipName);
  if (!fs.existsSync(bundledZip)) {
    console.warn(`[ensure-electron-cache] Not found: ${bundledZip}`);
    console.warn('[ensure-electron-cache] Skipping local cache population.');
    process.exit(0);
  }

  const cacheDir = path.join(projectRoot, 'packages', 'electron-cache');
  ensureDir(cacheDir);

  const cacheZip = path.join(cacheDir, zipName);
  const copied = copyIfMissing(bundledZip, cacheZip);

  if (copied) {
    console.log(`[ensure-electron-cache] Copied Electron zip into cache: ${cacheZip}`);
  } else {
    console.log(`[ensure-electron-cache] Electron zip already in cache: ${cacheZip}`);
  }

  // Hint for troubleshooting
  console.log(`[ensure-electron-cache] Using electronDownload.cache = ${cacheDir}`);
})();
