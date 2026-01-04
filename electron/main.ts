import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import path from 'path'
import { PtyManager } from './pty-manager'
import { CopilotManager } from './copilot-manager'
import { FtpManager } from './ftp-manager'
import { checkForUpdates, UpdateCheckResult } from './update-checker'
import { snippetDb, CreateSnippetInput } from './snippet-db'

// Set AppUserModelId for Windows taskbar pinning (must be before app.whenReady)
if (process.platform === 'win32') {
  app.setAppUserModelId('com.fareastone.billing-integration')
}
app.name = 'AI維運平台'

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let copilotManager: CopilotManager | null = null
let ftpManager: FtpManager | null = null
let updateCheckResult: UpdateCheckResult | null = null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const GITHUB_REPO_URL = 'https://github.com/fareastone-mikekuan/better-agent-terminal'

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

app.whenReady().then(async () => {
  buildMenu()
  createWindow()

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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
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

ipcMain.handle('dialog:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('workspace:save', async (_event, data: string) => {
  const fs = await import('fs/promises')
  const userDataPath = app.getPath('userData')
  const configPath = path.join(userDataPath, 'workspaces.json')
  
  // Ensure directory exists
  try {
    await fs.mkdir(userDataPath, { recursive: true })
  } catch (err) {
    console.error('Failed to create userData directory:', err)
  }
  
  await fs.writeFile(configPath, data, 'utf-8')
  return true
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
  const fs = await import('fs/promises')
  const configPath = path.join(app.getPath('userData'), 'settings.json')
  await fs.writeFile(configPath, data, 'utf-8')
  return true
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

// System info handler
ipcMain.handle('system:get-info', async () => {
  const os = await import('os')
  return {
    username: os.userInfo().username || 'user',
    hostname: os.hostname() || 'localhost'
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
    
    return new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http
      
      client.get(url, (res) => {
        let data = ''
        
        res.on('data', (chunk) => {
          data += chunk
        })
        
        res.on('end', () => {
          resolve(data)
        })
      }).on('error', (err) => {
        reject(err.message)
      })
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
