import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import path from 'path'
import fs from 'fs'
import { PtyManager } from './pty-manager'
import { CopilotManager } from './copilot-manager'
import { FtpManager } from './ftp-manager'
import { checkForUpdates, UpdateCheckResult } from './update-checker'
import { snippetDb, CreateSnippetInput } from './snippet-db'

// Suppress Chromium cache warnings
process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'

// Set AppUserModelId for Windows taskbar pinning (must be before app.whenReady)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.fareastone.billing-integration')
}
app.name = 'AI維運平台'

// Disable GPU cache to prevent cache errors
app.commandLine.appendSwitch('disable-http-cache')
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let copilotManager: CopilotManager | null = null
let ftpManager: FtpManager | null = null
let updateCheckResult: UpdateCheckResult | null = null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const GITHUB_REPO_URL = 'https://github.com/fareastone-mikekuan/better-agent-terminal'

/**
 * Safe file write with retry logic
 * Handles file locks and permission issues
 * Returns true on success, false on failure (does not throw)
 */
async function safeWriteFile(filePath: string, data: string, retries = 3): Promise<boolean> {
  const fs = await import('fs/promises')
  const dirPath = path.dirname(filePath)
  
  // Ensure directory exists
  try {
    await fs.mkdir(dirPath, { recursive: true })
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      console.error(`[Main] Failed to create directory ${dirPath}:`, err)
      return false
    }
  }
  
  let lastError: any = null
  const maxRetries = retries
  
  while (retries > 0) {
    try {
      // Simple direct write approach - avoid complex atomic operations on Windows
      // that can cause file lock issues
      
      // First, clean up any leftover temp files
      const tempPath = filePath + '.tmp'
      try {
        await fs.unlink(tempPath)
      } catch (e) {
        // Ignore
      }
      try {
        await fs.unlink(filePath + '.old')
      } catch (e) {
        // Ignore
      }
      
      // Try direct write
      await fs.writeFile(filePath, data, { encoding: 'utf-8', flag: 'w' })
      return true
      
    } catch (err: any) {
      lastError = err
      retries--
      const attempt = maxRetries - retries
      
      if (err.code === 'EPERM' || err.code === 'EACCES' || err.code === 'EBUSY') {
        console.warn(`[Main] File ${filePath} is locked (attempt ${attempt}/${maxRetries})`)
      } else {
        console.warn(`[Main] Failed to write ${filePath} (attempt ${attempt}/${maxRetries}):`, err.code || err.message)
      }
      
      if (retries > 0) {
        // Progressive backoff with longer waits for lock issues
        const waitTime = err.code === 'EPERM' ? 1000 * attempt : 200 * attempt
        console.log(`[Main] Retrying in ${waitTime}ms...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
      }
    }
  }
  
  console.error(`[Main] Failed to write ${filePath} after ${maxRetries} retries:`, lastError?.code || lastError?.message)
  console.log(`[Main] Note: Data should be preserved in localStorage backup`)
  return false
}

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '檔案',
      submenu: [
        { role: 'quit', label: '結束' }
      ]
    },
    {
      label: '編輯',
      submenu: [
        { role: 'undo', label: '復原' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪下' },
        { role: 'copy', label: '複製' },
        { role: 'paste', label: '貼上' },
        { role: 'selectAll', label: '全選' }
      ]
    },
    {
      label: '檢視',
      submenu: [
        { role: 'reload', label: '重新載入' },
        { role: 'toggleDevTools', label: '開發者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重設縮放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '縮小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全螢幕' }
      ]
    },
    {
      label: '說明',
      submenu: [
        {
          label: 'GitHub 儲存庫',
          click: () => shell.openExternal(GITHUB_REPO_URL)
        },
        {
          label: '回報問題',
          click: () => shell.openExternal(`${GITHUB_REPO_URL}/issues`)
        },
        {
          label: '發行版本',
          click: () => shell.openExternal(`${GITHUB_REPO_URL}/releases`)
        },
        { type: 'separator' },
        {
          label: '關於',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: '關於 AI維運平台',
              message: 'AI維運平台',
          detail: `版本: ${app.getVersion()}\n\n提供先進的終端機整合平台，整合 GitHub Copilot 智慧小助手。\n\n作者: TonyQ、Mike Kuan`
            })
          }
        }
      ]
    }
  ]

  // Add Update menu item if update is available
  if (updateCheckResult?.hasUpdate && updateCheckResult.latestRelease) {
    template.push({
      label: '🎉 有新版本！',
      submenu: [
        {
          label: `下載 ${updateCheckResult.latestRelease.tagName}`,
          click: () => {
            const url = updateCheckResult!.latestRelease!.downloadUrl || updateCheckResult!.latestRelease!.htmlUrl
            shell.openExternal(url)
          }
        },
        {
          label: '查看更新說明',
          click: () => shell.openExternal(updateCheckResult!.latestRelease!.htmlUrl)
        }
      ]
    })
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true
    },
    frame: true,
    titleBarStyle: 'default',
    title: 'AI維運平台',
    icon: path.join(__dirname, '../assets/icon.ico')
  })

  ptyManager = new PtyManager(mainWindow)
  copilotManager = new CopilotManager(mainWindow)

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
    ptyManager?.dispose()
    ptyManager = null
  })
}

// Cleanup before app quits
app.on('before-quit', () => {
  console.log('[Main] App is quitting, cleaning up...')
  if (ptyManager) {
    ptyManager.dispose()
    ptyManager = null
  }
  if (copilotManager) {
    copilotManager = null
  }
  if (ftpManager) {
    ftpManager = null
  }
})

app.whenReady().then(async () => {
  buildMenu()
  createWindow()

  // Cleanup any leftover temp files from previous runs
  setTimeout(async () => {
    const fs = await import('fs/promises')
    const userData = app.getPath('userData')
    const filesToClean = ['workspaces.json.tmp', 'workspaces.json.old', 'settings.json.tmp', 'settings.json.old', 'skills.json.tmp', 'skills.json.old']
    for (const file of filesToClean) {
      try {
        await fs.unlink(path.join(userData, file))
        console.log(`[Main] Cleaned up leftover file: ${file}`)
      } catch (e) {
        // Ignore - file doesn't exist
      }
    }
  }, 1000)

  // Check for updates after startup
  setTimeout(async () => {
    try {
      updateCheckResult = await checkForUpdates()
      if (updateCheckResult.hasUpdate) {
        // Rebuild menu to show update option
        buildMenu()
      }
    } catch (error) {
      console.error('Failed to check for updates:', error)
    }
  }, 2000)
})

app.on('window-all-closed', async () => {
  // Clean up before quitting
  console.log('[Main] All windows closed, cleaning up...')
  
  if (ptyManager) {
    console.log('[Main] Cleaning up PTY instances...')
    try {
      ptyManager.dispose()
    } catch (e) {
      console.error('[Main] Error during PTY cleanup:', e)
    }
    ptyManager = null
  }
  
  if (copilotManager) {
    copilotManager = null
  }
  
  if (ftpManager) {
    ftpManager = null
  }
  
  console.log('[Main] Cleanup done, exiting...')
  
  // Don't wait, just exit immediately
  app.exit(0)
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Handle app will quit - final cleanup
app.on('will-quit', () => {
  console.log('[Main] App will quit, performing final cleanup...')
  
  // Force cleanup synchronously
  if (ptyManager) {
    try {
      ptyManager.dispose()
    } catch (e) {
      // Ignore errors during cleanup
    }
    ptyManager = null
  }
  
  copilotManager = null
  ftpManager = null
  
  console.log('[Main] Cleanup completed')
})

// IPC Handlers
ipcMain.handle('pty:create', async (_event, options) => {
  return ptyManager?.create(options)
})

ipcMain.handle('pty:write', async (_event, id: string, data: string) => {
  console.log('[Main] pty:write received:', { id, data: data.charCodeAt(0), char: data })
  ptyManager?.write(id, data)
})

ipcMain.handle('pty:resize', async (_event, id: string, cols: number, rows: number) => {
  ptyManager?.resize(id, cols, rows)
})

ipcMain.handle('pty:kill', async (_event, id: string) => {
  return ptyManager?.kill(id)
})

ipcMain.handle('pty:restart', async (_event, id: string, cwd: string, shell?: string) => {
  return ptyManager?.restart(id, cwd, shell)
})

ipcMain.handle('pty:get-cwd', async (_event, id: string) => {
  return ptyManager?.getCwd(id)
})

ipcMain.handle('pty:start-capture', async (_event, id: string) => {
  ptyManager?.startCapture(id)
})

ipcMain.handle('pty:stop-capture', async (_event, id: string) => {
  return ptyManager?.stopCapture(id) || ''
})

ipcMain.handle('pty:get-capture', async (_event, id: string) => {
  return ptyManager?.getCapture(id) || ''
})

// File system helper for AI analysis
ipcMain.handle('fs:read-file', async (_event, filePath: string, cwd: string) => {
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    
    // Resolve relative path against cwd
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath)
    
    // Read file (limit to first 100 lines or 10KB)
    const content = await fs.readFile(absolutePath, 'utf-8')
    const lines = content.split('\n').slice(0, 100)
    const limitedContent = lines.join('\n')
    
    return {
      success: true,
      content: limitedContent.substring(0, 10000) // Max 10KB
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})

// Write file (for skill.md creation)
ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string) => {
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    
    // Ensure directory exists
    const dir = path.dirname(filePath)
    await fs.mkdir(dir, { recursive: true })
    
    // Write file
    await fs.writeFile(filePath, content, 'utf-8')
    
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
})


ipcMain.handle('dialog:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('workspace:save', async (_event, data: string) => {
  const configPath = path.join(app.getPath('userData'), 'workspaces.json')
  const success = await safeWriteFile(configPath, data)
  if (!success) {
    console.warn('[Main] Workspaces file save failed, data is in localStorage backup')
  }
  return success
})

ipcMain.handle('workspace:load', async () => {
  const fs = await import('fs/promises')
  const configPath = path.join(app.getPath('userData'), 'workspaces.json')
  try {
    const data = await fs.readFile(configPath, 'utf-8')
    return data
  } catch {
    return null
  }
})

// Settings handlers
ipcMain.handle('settings:save', async (_event, data: string) => {
  const configPath = path.join(app.getPath('userData'), 'settings.json')
  const success = await safeWriteFile(configPath, data)
  if (!success) {
    console.warn('[Main] Settings file save failed, data may be in localStorage')
  }
  return success
})

ipcMain.handle('settings:load', async () => {
  const fs = await import('fs/promises')
  const configPath = path.join(app.getPath('userData'), 'settings.json')
  try {
    const data = await fs.readFile(configPath, 'utf-8')
    return data
  } catch {
    return null
  }
})

// Skills handlers
ipcMain.handle('skills:save', async (_event, data: string) => {
  const configPath = path.join(app.getPath('userData'), 'skills.json')
  console.log('[Main] Saving skills to:', configPath)
  const success = await safeWriteFile(configPath, data)
  if (success) {
    console.log('[Main] Skills saved successfully')
  } else {
    console.warn('[Main] Skills file save failed')
  }
  return success
})

ipcMain.handle('skills:load', async () => {
  const fs = await import('fs/promises')
  const configPath = path.join(app.getPath('userData'), 'skills.json')
  console.log('[Main] Loading skills from:', configPath)
  try {
    const data = await fs.readFile(configPath, 'utf-8')
    console.log('[Main] Skills loaded successfully, size:', data.length, 'bytes')
    return data
  } catch (err) {
    console.log('[Main] Skills file not found or read failed:', err)
    return null
  }
})

// Skills marketplace handlers
ipcMain.handle('skills:load-sources', async () => {
  const fs = await import('fs/promises')
  const sourcesPath = path.join(app.getPath('userData'), 'skill-sources.json')
  try {
    const data = await fs.readFile(sourcesPath, 'utf-8')
    return JSON.parse(data)
  } catch (error) {
    console.log('[Main] 技能源配置不存在，使用默認值')
    return []
  }
})

ipcMain.handle('skills:save-sources', async (_event, sources) => {
  const sourcesPath = path.join(app.getPath('userData'), 'skill-sources.json')
  const success = await safeWriteFile(sourcesPath, JSON.stringify(sources, null, 2))
  if (success) {
    console.log('[Main] Skill sources saved successfully')
  } else {
    console.warn('[Main] Skill sources file save failed')
  }
  return success
})

// Data export/import handlers
ipcMain.handle('data:export', async () => {
  if (!mainWindow) return null
  
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '匯出所有數據',
    defaultPath: `better-terminal-backup-${new Date().toISOString().split('T')[0]}.json`,
    filters: [
      { name: 'JSON 檔案', extensions: ['json'] },
      { name: '所有檔案', extensions: ['*'] }
    ]
  })

  if (result.canceled || !result.filePath) {
    return null
  }

  return result.filePath
})

ipcMain.handle('data:import', async () => {
  if (!mainWindow) return null

  const result = await dialog.showOpenDialog(mainWindow, {
    title: '匯入數據',
    filters: [
      { name: 'JSON 檔案', extensions: ['json'] },
      { name: '所有檔案', extensions: ['*'] }
    ],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const fs = await import('fs/promises')
  try {
    const data = await fs.readFile(result.filePaths[0], 'utf-8')
    return data
  } catch (error) {
    console.error('Failed to read import file:', error)
    return null
  }
})

ipcMain.handle('data:save-to-file', async (_event, filePath: string, data: string) => {
  const fs = await import('fs/promises')
  try {
    await fs.writeFile(filePath, data, 'utf-8')
    return true
  } catch (error) {
    console.error('Failed to save file:', error)
    return false
  }
})

ipcMain.handle('settings:get-shell-path', async (_event, shellType: string) => {
  const fs = await import('fs')

  // macOS and Linux support
  if (process.platform === 'darwin' || process.platform === 'linux') {
    if (shellType === 'auto') {
      return process.env.SHELL || '/bin/zsh'
    }
    // For non-auto, return the shellType as-is (custom path) or default shell
    if (shellType === 'pwsh' || shellType === 'powershell' || shellType === 'cmd') {
      // Windows shells requested on Unix - fall back to default
      return process.env.SHELL || '/bin/zsh'
    }
    return shellType // custom path
  }

  // Windows support
  if (shellType === 'auto' || shellType === 'pwsh') {
    const path = await import('path')
    
    // 1. 優先使用專案內建的 PowerShell
    let projectRoot: string
    if (app.isPackaged) {
      projectRoot = app.getAppPath()
      if (projectRoot.includes('.asar')) {
        projectRoot = path.dirname(projectRoot)
      }
    } else {
      projectRoot = process.cwd()
    }
    
    const bundledPwsh = path.join(projectRoot, 'packages', 'PowerShell', 'pwsh.exe')
    if (fs.existsSync(bundledPwsh)) {
      return bundledPwsh
    }
    
    // 2. 嘗試從 PATH 找 pwsh
    const { execSync } = await import('child_process')
    try {
      const pwshPath = execSync('where pwsh', { encoding: 'utf8' }).trim().split('\n')[0]
      if (pwshPath && fs.existsSync(pwshPath)) {
        return pwshPath
      }
    } catch (e) {
      // Not in PATH, try common locations
      const pwshPaths = [
        'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
        'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe',
        process.env.LOCALAPPDATA + '\\Microsoft\\WindowsApps\\pwsh.exe'
      ]
      for (const p of pwshPaths) {
        if (fs.existsSync(p)) {
          return p
        }
      }
    }
    if (shellType === 'pwsh') return 'pwsh.exe'
  }

  if (shellType === 'auto' || shellType === 'powershell') {
    return 'powershell.exe'
  }

  if (shellType === 'cmd') {
    return 'cmd.exe'
  }

  return shellType // custom path
})

ipcMain.handle('shell:open-external', async (_event, url: string) => {
  await shell.openExternal(url)
})

// Execute command in workspace terminal
ipcMain.handle('terminal:execute-command', async (_event, workspaceId: string, command: string) => {
  if (!mainWindow) return
  
  // Send command to the first terminal of the workspace
  // The renderer will handle finding the right terminal
  mainWindow.webContents.send('terminal:execute-command', workspaceId, command)
})

// System info handler
ipcMain.handle('system:get-info', async () => {
  const os = await import('os')
  return {
    username: os.userInfo().username || 'user',
    hostname: os.hostname() || 'localhost'
  }
})

// System platform handler
ipcMain.handle('system:get-platform', () => {
  return process.platform
})

// Cache git path
let cachedGitPath: string | null = null

async function findGitPath(): Promise<string> {
  if (cachedGitPath) return cachedGitPath
  
  const { execSync } = await import('child_process')
  
  if (process.platform === 'win32') {
    // Windows: use bundled git from packages/Git/
    const bundledGit = path.join(projectRoot, 'packages', 'Git', 'cmd', 'git.exe')
    if (fs.existsSync(bundledGit)) {
      console.log('[Git] Using bundled Git:', bundledGit)
      cachedGitPath = bundledGit
      return bundledGit
    }
    throw new Error('Git portable not found. Please run: npm install')
  } else {
    // Linux/Mac: use system git via which command
    try {
      const gitPath = execSync('which git', { encoding: 'utf8' }).trim()
      if (gitPath && fs.existsSync(gitPath)) {
        console.log('[Git] Using system Git:', gitPath)
        cachedGitPath = gitPath
        return gitPath
      }
    } catch (err) {
      // which failed, try common paths
      const commonPaths = ['/usr/bin/git', '/usr/local/bin/git', '/opt/homebrew/bin/git']
      for (const gitPath of commonPaths) {
        if (fs.existsSync(gitPath)) {
          console.log('[Git] Found Git at:', gitPath)
          cachedGitPath = gitPath
          return gitPath
        }
      }
    }
    throw new Error('Git not found. Please install: sudo apt install git')
  }
}

// Git command execution handler
ipcMain.handle('git:execute', async (_event, cwd: string, args: string[]) => {
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const execFileAsync = promisify(execFile)
  
  try {
    const gitPath = await findGitPath()
    
    console.log('[Git] Executing:', gitPath, args, 'in', cwd)
    const { stdout, stderr } = await execFileAsync(gitPath, args, { 
      cwd,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 // 1MB
    })
    
    return { success: true, output: stdout, error: stderr }
  } catch (error: any) {
    console.error('[Git] Command failed:', error)
    return { 
      success: false, 
      output: '', 
      error: error.message || String(error)
    }
  }
})

// Git remote history fetcher (shallow clone to temp directory)
ipcMain.handle('git:fetchRemoteHistory', async (_event, remoteUrl: string, branch: string = 'main') => {
  const os = await import('os')
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const execFileAsync = promisify(execFile)
  
  const tempDir = path.join(os.tmpdir(), `git-temp-${Date.now()}`)
  
  try {
    const gitPath = await findGitPath()
    
    // Create temp directory
    await fs.promises.mkdir(tempDir, { recursive: true })
    
    console.log('[Git] Shallow cloning', remoteUrl, 'to', tempDir)
    
    // Shallow clone with depth 20
    await execFileAsync(gitPath, [
      'clone',
      '--depth', '20',
      '--single-branch',
      '--branch', branch,
      remoteUrl,
      tempDir
    ], { 
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024, // 10MB for clone
      timeout: 60000 // 60s timeout
    })
    
    // Get commit log
    const { stdout } = await execFileAsync(gitPath, [
      'log',
      '--oneline',
      '--format=%H|%an|%ad|%s',
      '--date=short',
      '-20'
    ], {
      cwd: tempDir,
      encoding: 'utf8'
    })
    
    return { success: true, output: stdout }
  } catch (error: any) {
    console.error('[Git] Remote history fetch failed:', error)
    return { 
      success: false, 
      output: '', 
      error: error.message || String(error)
    }
  } finally {
    // Clean up temp directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    } catch (cleanupErr) {
      console.error('[Git] Failed to cleanup temp dir:', cleanupErr)
    }
  }
})

// Git remote commit details fetcher (shallow clone to temp directory and get commit details)
ipcMain.handle('git:fetchRemoteCommitDetails', async (_event, remoteUrl: string, commitHash: string, branch: string = 'main') => {
  const os = await import('os')
  const { execFile } = await import('child_process')
  const { promisify } = await import('util')
  const execFileAsync = promisify(execFile)
  
  const tempDir = path.join(os.tmpdir(), `git-commit-${Date.now()}`)
  
  try {
    const gitPath = await findGitPath()
    
    // Create temp directory
    await fs.promises.mkdir(tempDir, { recursive: true })
    
    console.log('[Git] Fetching commit details for', commitHash, 'from', remoteUrl)
    
    // Shallow clone with enough depth to include the commit
    await execFileAsync(gitPath, [
      'clone',
      '--depth', '50',
      '--single-branch',
      '--branch', branch,
      remoteUrl,
      tempDir
    ], { 
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024, // 20MB for clone
      timeout: 90000 // 90s timeout
    })
    
    // Get commit details with diff
    const { stdout } = await execFileAsync(gitPath, [
      'show',
      '--stat',
      '--pretty=fuller',
      commitHash
    ], {
      cwd: tempDir,
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024 // 5MB for diff output
    })
    
    return { success: true, output: stdout }
  } catch (error: any) {
    console.error('[Git] Commit details fetch failed:', error)
    return { 
      success: false, 
      output: '', 
      error: error.message || String(error)
    }
  } finally {
    // Clean up temp directory
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    } catch (cleanupErr) {
      console.error('[Git] Failed to cleanup temp dir:', cleanupErr)
    }
  }
})

// Update checker handlers
ipcMain.handle('update:check', async () => {
  try {
    return await checkForUpdates()
  } catch (error) {
    console.error('Failed to check for updates:', error)
    return {
      hasUpdate: false,
      currentVersion: app.getVersion(),
      latestRelease: null
    }
  }
})

ipcMain.handle('update:get-version', () => {
  return app.getVersion()
})

// Snippet handlers
ipcMain.handle('snippet:getAll', () => {
  return snippetDb.getAll()
})

ipcMain.handle('snippet:getById', (_event, id: number) => {
  return snippetDb.getById(id)
})

ipcMain.handle('snippet:create', (_event, input: CreateSnippetInput) => {
  return snippetDb.create(input)
})

ipcMain.handle('snippet:update', (_event, id: number, updates: Partial<CreateSnippetInput>) => {
  return snippetDb.update(id, updates)
})

ipcMain.handle('snippet:delete', (_event, id: number) => {
  return snippetDb.delete(id)
})

ipcMain.handle('snippet:toggleFavorite', (_event, id: number) => {
  return snippetDb.toggleFavorite(id)
})

ipcMain.handle('snippet:search', (_event, query: string) => {
  return snippetDb.search(query)
})

ipcMain.handle('snippet:getCategories', () => {
  return snippetDb.getCategories()
})

// Fetch webpage content (bypass CORS)
ipcMain.handle('webpage:fetch', async (_event, url: string) => {
  try {
    const https = await import('https')
    const http = await import('http')
    const { URL } = await import('url')
    
    return new Promise((resolve, reject) => {
      // Use URL constructor to properly parse and encode the URL
      const parsedUrl = new URL(url)
      const client = url.startsWith('https') ? https : http
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search, // This is already properly encoded
        method: 'GET',
        headers: {
          'User-Agent': 'AI-Agent-Terminal/1.0 (https://github.com/fareastone-mikekuan/better-agent-terminal; AI assistant for operations)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive'
        }
      }
      
      const req = client.request(options, (res) => {
        let data = ''
        
        // Handle gzip/deflate encoding
        let stream = res
        if (res.headers['content-encoding'] === 'gzip') {
          const zlib = require('zlib')
          stream = res.pipe(zlib.createGunzip())
        } else if (res.headers['content-encoding'] === 'deflate') {
          const zlib = require('zlib')
          stream = res.pipe(zlib.createInflate())
        }
        
        stream.on('data', (chunk) => {
          data += chunk
        })
        
        stream.on('end', () => {
          resolve(data)
        })
        
        stream.on('error', (err) => {
          reject(err.message)
        })
      })
      
      req.on('error', (err) => {
        reject(err.message)
      })
      
      req.end()
    })
  } catch (error) {
    throw new Error(`Failed to fetch webpage: ${error}`)
  }
})

ipcMain.handle('snippet:getFavorites', () => {
  return snippetDb.getFavorites()
})

// GitHub Copilot Integration handlers
ipcMain.handle('copilot:set-config', async (_event, config: any) => {
  copilotManager?.setConfig(config)

  // Persist config to disk
  try {
    const fs = await import('fs/promises')
    const configPath = path.join(app.getPath('userData'), 'copilot-config.json')
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8')
  } catch (error) {
    console.error('Failed to save Copilot config:', error)
  }

  return true
})

ipcMain.handle('copilot:get-config', async () => {
  // Try to load config from disk first
  try {
    const fs = await import('fs/promises')
    const configPath = path.join(app.getPath('userData'), 'copilot-config.json')
    const data = await fs.readFile(configPath, 'utf-8')
    const config = JSON.parse(data)

    // Set config to manager if not already set
    if (copilotManager) {
      copilotManager.setConfig(config)
    }

    return config
  } catch {
    // Return default config if file doesn't exist
    return {
      enabled: false,
      apiKey: '',
      organizationSlug: ''
    }
  }
})

ipcMain.handle('copilot:is-enabled', async () => {
  return copilotManager?.isEnabled() ?? false
})

ipcMain.handle('copilot:chat', async (_event, chatId: string, options: any) => {
  try {
    return await copilotManager?.chat(chatId, options)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return {
      error: errorMessage,
      content: '',
      finishReason: 'error' as const
    }
  }
})

ipcMain.handle('copilot:cancel-chat', async (_event, chatId: string) => {
  copilotManager?.cancelChat(chatId)
  return true
})

ipcMain.handle('copilot:list-models', async () => {
  try {
    const ids = await copilotManager?.listModels()
    return { ids: ids || [] }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { error: errorMessage, ids: [] }
  }
})

ipcMain.handle('copilot:start-device-flow', async () => {
  try {
    return await copilotManager?.startDeviceFlow()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(errorMessage)
  }
})

ipcMain.handle('copilot:complete-device-flow', async (_event, deviceCode: string) => {
  try {
    return await copilotManager?.completeDeviceFlow(deviceCode)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(errorMessage)
  }
})

// FTP/SFTP handlers
ipcMain.handle('ftp:connect', async (_event, config) => {
  try {
    if (!ftpManager) {
      ftpManager = new FtpManager()
    }
    await ftpManager.connect(config)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
})

ipcMain.handle('ftp:disconnect', async () => {
  try {
    await ftpManager?.disconnect()
    ftpManager = null
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
})

ipcMain.handle('ftp:list', async (_event, path: string) => {
  try {
    if (!ftpManager) {
      throw new Error('未連接到 FTP/SFTP 伺服器')
    }
    const files = await ftpManager.listFiles(path)
    return { success: true, files }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
})

ipcMain.handle('ftp:read', async (_event, path: string) => {
  try {
    if (!ftpManager) {
      throw new Error('未連接到 FTP/SFTP 伺服器')
    }
    const content = await ftpManager.readFile(path)
    return { success: true, content }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
})

ipcMain.handle('ftp:download', async (_event, remotePath: string, localPath: string) => {
  try {
    if (!ftpManager) {
      throw new Error('未連接到 FTP/SFTP 伺服器')
    }
    await ftpManager.downloadFile(remotePath, localPath)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
})

ipcMain.handle('ftp:is-connected', async () => {
  return ftpManager?.isConnected() || false
})

ipcMain.handle('ftp:download-to-temp', async (_event, remotePath: string, fileName: string) => {
  try {
    if (!ftpManager) {
      throw new Error('未連接到 FTP/SFTP 伺服器')
    }
    const os = await import('os')
    const path = await import('path')
    const tempDir = os.tmpdir()
    const timestamp = Date.now()
    const tempPath = path.join(tempDir, `bat_${timestamp}_${fileName}`)
    await ftpManager.downloadFile(remotePath, tempPath)
    return { success: true, localPath: tempPath }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
})

// PDF Generator handlers
ipcMain.handle('pdf:generate-invoice', async (_event, invoiceData) => {
  try {
    const { generateInvoicePDF, parseInvoiceFromText } = await import('./pdf-generator')
    
    // 如果是文字格式，先解析成結構化資料
    let data = invoiceData
    if (typeof invoiceData === 'string') {
      const parsed = parseInvoiceFromText(invoiceData)
      if (!parsed) {
        throw new Error('無法解析帳單資料')
      }
      data = parsed
    }
    
    const pdfBuffer = await generateInvoicePDF(data)
    return { success: true, buffer: pdfBuffer.toString('base64') }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[PDF] Generation error:', errorMessage)
    return { success: false, error: errorMessage }
  }
})

ipcMain.handle('pdf:save-invoice', async (_event, invoiceData, suggestedName?: string) => {
  try {
    const { generateInvoicePDF, parseInvoiceFromText } = await import('./pdf-generator')
    const fs = await import('fs')
    
    // 如果是文字格式，先解析成結構化資料
    let data = invoiceData
    if (typeof invoiceData === 'string') {
      const parsed = parseInvoiceFromText(invoiceData)
      if (!parsed) {
        throw new Error('無法解析帳單資料')
      }
      data = parsed
    }
    
    // 顯示儲存對話框
    const defaultName = suggestedName || `帳單-${data.invoiceNumber || Date.now()}.pdf`
    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '儲存帳單 PDF',
      defaultPath: defaultName,
      filters: [
        { name: 'PDF 檔案', extensions: ['pdf'] }
      ]
    })
    
    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true }
    }
    
    const pdfBuffer = await generateInvoicePDF(data)
    fs.writeFileSync(result.filePath, pdfBuffer)
    
    console.log('[PDF] Saved to:', result.filePath)
    return { success: true, filePath: result.filePath }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('[PDF] Save error:', errorMessage)
    return { success: false, error: errorMessage }
  }
})

ipcMain.handle('pdf:open-file', async (_event, filePath: string) => {
  try {
    await shell.openPath(filePath)
    return { success: true }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
})

// Skill action handlers
ipcMain.handle('skill:execute-api-call', async (_event, params: { method: string; url: string; headers?: Record<string, string>; body?: string }) => {
  try {
    const https = await import('https')
    const http = await import('http')
    const { URL } = await import('url')
    
    return new Promise((resolve) => {
      const parsedUrl = new URL(params.url)
      const client = params.url.startsWith('https') ? https : http
      
      const postData = params.body ? Buffer.from(params.body, 'utf-8') : undefined
      
      const options: any = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname + parsedUrl.search,
        method: params.method.toUpperCase(),
        headers: {
          'User-Agent': 'AI-Agent-Terminal/1.0',
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...params.headers
        }
      }
      
      if (postData) {
        options.headers['Content-Length'] = Buffer.byteLength(postData)
      }
      
      const req = client.request(options, (res) => {
        let data = ''
        
        res.on('data', (chunk) => {
          data += chunk
        })
        
        res.on('end', () => {
          try {
            const jsonData = JSON.parse(data)
            resolve({ success: true, data: jsonData })
          } catch {
            resolve({ success: true, data })
          }
        })
        
        res.on('error', (err) => {
          resolve({ success: false, error: err.message })
        })
      })
      
      req.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })
      
      if (postData) {
        req.write(postData)
      }
      req.end()
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
})

ipcMain.handle('skill:execute-db-query', async (_event, params: { connection?: string; query: string }) => {
  try {
    const { query } = params
    const queryLower = query.toLowerCase()
    
    // 模擬資料庫查詢結果（與 OraclePanel 一致）
    // TODO: 未來整合真實資料庫連接
    let data: any[] = []
    
    if (queryLower.includes('show databases') || queryLower.includes('show schemas')) {
      data = [
        { DATABASE: 'employees' },
        { DATABASE: 'hr_system' },
        { DATABASE: 'inventory' },
        { DATABASE: 'sales' }
      ]
    } else if (queryLower.includes('show tables') || queryLower.includes('user_tables') || queryLower.includes('all_tables')) {
      data = [
        { TABLE_NAME: 'EMPLOYEES', TABLESPACE_NAME: 'USERS', NUM_ROWS: 107 },
        { TABLE_NAME: 'DEPARTMENTS', TABLESPACE_NAME: 'USERS', NUM_ROWS: 27 },
        { TABLE_NAME: 'LOCATIONS', TABLESPACE_NAME: 'USERS', NUM_ROWS: 23 },
        { TABLE_NAME: 'COUNTRIES', TABLESPACE_NAME: 'USERS', NUM_ROWS: 25 },
        { TABLE_NAME: 'REGIONS', TABLESPACE_NAME: 'USERS', NUM_ROWS: 4 },
        { TABLE_NAME: 'JOBS', TABLESPACE_NAME: 'USERS', NUM_ROWS: 19 }
      ]
    } else if (queryLower.includes('employees') || queryLower.includes('emp')) {
      data = [
        { EMPLOYEE_ID: 100, FIRST_NAME: 'Steven', LAST_NAME: 'King', EMAIL: 'SKING', HIRE_DATE: '17-JUN-03', SALARY: 24000 },
        { EMPLOYEE_ID: 101, FIRST_NAME: 'Neena', LAST_NAME: 'Kochhar', EMAIL: 'NKOCHHAR', HIRE_DATE: '21-SEP-05', SALARY: 17000 },
        { EMPLOYEE_ID: 102, FIRST_NAME: 'Lex', LAST_NAME: 'De Haan', EMAIL: 'LDEHAAN', HIRE_DATE: '13-JAN-01', SALARY: 17000 },
        { EMPLOYEE_ID: 103, FIRST_NAME: 'Alexander', LAST_NAME: 'Hunold', EMAIL: 'AHUNOLD', HIRE_DATE: '03-JAN-06', SALARY: 9000 },
        { EMPLOYEE_ID: 104, FIRST_NAME: 'Bruce', LAST_NAME: 'Ernst', EMAIL: 'BERNST', HIRE_DATE: '21-MAY-07', SALARY: 6000 },
        { EMPLOYEE_ID: 105, FIRST_NAME: 'David', LAST_NAME: 'Austin', EMAIL: 'DAUSTIN', HIRE_DATE: '25-JUN-05', SALARY: 4800 }
      ]
    } else if (queryLower.includes('dual')) {
      data = [{ DUMMY: 'X' }]
    } else {
      // 通用查詢返回示例數據
      data = [
        { RESULT: '查詢已執行', STATUS: 'SUCCESS', ROWS_AFFECTED: 0 }
      ]
    }
    
    return { 
      success: true, 
      data: data,
      rowCount: data.length,
      message: `查詢成功，返回 ${data.length} 行數據`
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
})

ipcMain.handle('skill:open-web-url', async (_event, url: string) => {
  try {
    if (!mainWindow) {
      await shell.openExternal(url)
      return
    }
    
    // 通知 renderer 在 WebView 面板開啟 URL
    mainWindow.webContents.send('webview:open-url', url)
  } catch (error) {
    console.error('Failed to open web URL:', error)
  }
})

ipcMain.handle('skill:execute-file-action', async (_event, params: { action: 'download' | 'upload' | 'open'; path: string }) => {
  try {
    const fs = await import('fs/promises')
    const { dialog, shell } = await import('electron')
    
    switch (params.action) {
      case 'open':
        // 用系統預設程式開啟文件
        await shell.openPath(params.path)
        return { success: true }
        
      case 'download':
        // 選擇儲存位置
        const result = await dialog.showSaveDialog({
          defaultPath: path.basename(params.path)
        })
        
        if (!result.canceled && result.filePath) {
          await fs.copyFile(params.path, result.filePath)
          return { success: true }
        }
        return { success: false, error: '使用者取消下載' }
        
      case 'upload':
        return { success: false, error: '上傳功能尚未實作' }
        
      default:
        return { success: false, error: `未知的文件操作: ${params.action}` }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
})

ipcMain.handle('skill:wait-for-condition', async (_event, params: { condition: string; target: string; timeout: number }) => {
  try {
    const startTime = Date.now()
    const timeoutMs = params.timeout * 1000
    
    switch (params.condition) {
      case 'time':
        // 簡單等待指定秒數
        const waitSeconds = parseInt(params.target)
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000))
        return { success: true }
        
      case 'file_exists':
        // 輪詢檢查文件是否存在
        const fs = await import('fs/promises')
        while (Date.now() - startTime < timeoutMs) {
          try {
            await fs.access(params.target)
            return { success: true }
          } catch {
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
        return { success: false, error: '等待超時' }
        
      case 'log_contains':
      case 'api_status':
        // 這些需要與 renderer 進行更複雜的互動，暫時不支援
        return { 
          success: false, 
          error: `條件 "${params.condition}" 尚未實作。請在對應面板手動檢查。` 
        }
        
      default:
        return { success: false, error: `未知的等待條件: ${params.condition}` }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return { success: false, error: errorMessage }
  }
})

