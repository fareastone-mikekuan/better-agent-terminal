import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from 'electron'
import path from 'path'
import { PtyManager } from './pty-manager'
import { CopilotManager } from './copilot-manager'
import { checkForUpdates, UpdateCheckResult } from './update-checker'

let mainWindow: BrowserWindow | null = null
let ptyManager: PtyManager | null = null
let copilotManager: CopilotManager | null = null
let updateCheckResult: UpdateCheckResult | null = null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const GITHUB_REPO_URL = 'https://github.com/tony1223/better-agent-terminal'

function buildMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'GitHub Repository',
          click: () => shell.openExternal(GITHUB_REPO_URL)
        },
        {
          label: 'Report Issue',
          click: () => shell.openExternal(`${GITHUB_REPO_URL}/issues`)
        },
        {
          label: 'Releases',
          click: () => shell.openExternal(`${GITHUB_REPO_URL}/releases`)
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About Better Agent Terminal',
              message: 'Better Agent Terminal',
          detail: `Version: ${app.getVersion()}\n\nA cross-platform terminal aggregator with multi-workspace support, GitHub Copilot integration, and Claude Code support.\n\nAuthor: TonyQ`
            })
          }
        }
      ]
    }
  ]

  // Add Update menu item if update is available
  if (updateCheckResult?.hasUpdate && updateCheckResult.latestRelease) {
    template.push({
      label: '🎉 Update Available!',
      submenu: [
        {
          label: `Download ${updateCheckResult.latestRelease.tagName}`,
          click: () => {
            const url = updateCheckResult!.latestRelease!.downloadUrl || updateCheckResult!.latestRelease!.htmlUrl
            shell.openExternal(url)
          }
        },
        {
          label: 'View Release Notes',
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
      contextIsolation: true
    },
    frame: true,
    titleBarStyle: 'default',
    title: 'Better Agent Terminal',
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

ipcMain.handle('dialog:select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('workspace:save', async (_event, data: string) => {
  const fs = await import('fs/promises')
  const configPath = path.join(app.getPath('userData'), 'workspaces.json')
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

// GitHub Copilot Integration handlers
ipcMain.handle('copilot:set-config', async (_event, config: any) => {
  copilotManager?.setConfig(config)
  return true
})

ipcMain.handle('copilot:get-config', async () => {
  return copilotManager?.getConfig()
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

ipcMain.handle('copilot:open-vscode-token-helper', async () => {
  try {
    return await copilotManager?.openVSCodeTokenHelper()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(errorMessage)
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
