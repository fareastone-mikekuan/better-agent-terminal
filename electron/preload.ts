import { contextBridge, ipcRenderer } from 'electron'
import type { CreatePtyOptions } from '../src/types'

const electronAPI = {
  pty: {
    create: (options: CreatePtyOptions) => ipcRenderer.invoke('pty:create', options),
    write: (id: string, data: string) => ipcRenderer.invoke('pty:write', id, data),
    resize: (id: string, cols: number, rows: number) => ipcRenderer.invoke('pty:resize', id, cols, rows),
    kill: (id: string) => ipcRenderer.invoke('pty:kill', id),
    restart: (id: string, cwd: string, shell?: string) => ipcRenderer.invoke('pty:restart', id, cwd, shell),
    getCwd: (id: string) => ipcRenderer.invoke('pty:get-cwd', id),
    startCapture: (id: string) => ipcRenderer.invoke('pty:start-capture', id),
    stopCapture: (id: string) => ipcRenderer.invoke('pty:stop-capture', id) as Promise<string>,
    getCapture: (id: string) => ipcRenderer.invoke('pty:get-capture', id) as Promise<string>,
    onOutput: (callback: (id: string, data: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, id: string, data: string) => callback(id, data)
      ipcRenderer.on('pty:output', handler)
      return () => ipcRenderer.removeListener('pty:output', handler)
    },
    onExit: (callback: (id: string, exitCode: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, id: string, exitCode: number) => callback(id, exitCode)
      ipcRenderer.on('pty:exit', handler)
      return () => ipcRenderer.removeListener('pty:exit', handler)
    }
  },
  fs: {
    readFile: (filePath: string, cwd: string) => ipcRenderer.invoke('fs:read-file', filePath, cwd) as Promise<{ success: boolean; content?: string; error?: string }>,
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:write-file', filePath, content) as Promise<{ success: boolean; error?: string }>
  },
  copilot: {
    setConfig: (config: any) => ipcRenderer.invoke('copilot:set-config', config),
    getConfig: () => ipcRenderer.invoke('copilot:get-config'),
    isEnabled: () => ipcRenderer.invoke('copilot:is-enabled'),
    chat: (chatId: string, options: any) => ipcRenderer.invoke('copilot:chat', chatId, options),
    cancelChat: (chatId: string) => ipcRenderer.invoke('copilot:cancel-chat', chatId),
    listModels: () => ipcRenderer.invoke('copilot:list-models'),
    openVSCodeTokenHelper: () => ipcRenderer.invoke('copilot:open-vscode-token-helper'),
    startDeviceFlow: () => ipcRenderer.invoke('copilot:start-device-flow'),
    completeDeviceFlow: (deviceCode: string) => ipcRenderer.invoke('copilot:complete-device-flow', deviceCode)
  },
  workspace: {
    save: (data: string) => ipcRenderer.invoke('workspace:save', data),
    load: () => ipcRenderer.invoke('workspace:load')
  },
  settings: {
    save: (data: string) => ipcRenderer.invoke('settings:save', data),
    load: () => ipcRenderer.invoke('settings:load'),
    getShellPath: (shell: string) => ipcRenderer.invoke('settings:get-shell-path', shell)
  },
  skills: {
    save: (data: string) => ipcRenderer.invoke('skills:save', data),
    load: () => ipcRenderer.invoke('skills:load'),
    loadSources: () => ipcRenderer.invoke('skills:load-sources'),
    saveSources: (sources: any) => ipcRenderer.invoke('skills:save-sources', sources)
  },
  data: {
    export: () => ipcRenderer.invoke('data:export'),
    import: () => ipcRenderer.invoke('data:import'),
    saveToFile: (filePath: string, data: string) => ipcRenderer.invoke('data:save-to-file', filePath, data)
  },
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:select-folder')
  },
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url)
  },
  terminal: {
    executeCommand: (workspaceId: string, command: string) => ipcRenderer.invoke('terminal:execute-command', workspaceId, command)
  },
  skill: {
    executeApiCall: (params: { method: string; url: string; headers?: Record<string, string>; body?: string }) => 
      ipcRenderer.invoke('skill:execute-api-call', params),
    executeDbQuery: (params: { connection?: string; query: string }) => 
      ipcRenderer.invoke('skill:execute-db-query', params),
    openWebUrl: (url: string) => 
      ipcRenderer.invoke('skill:open-web-url', url),
    executeFileAction: (params: { action: 'download' | 'upload' | 'open'; path: string }) => 
      ipcRenderer.invoke('skill:execute-file-action', params),
    waitForCondition: (params: { condition: string; target: string; timeout: number }) => 
      ipcRenderer.invoke('skill:wait-for-condition', params)
  },
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    getVersion: () => ipcRenderer.invoke('update:get-version')
  },
  snippet: {
    getAll: () => ipcRenderer.invoke('snippet:getAll'),
    getById: (id: number) => ipcRenderer.invoke('snippet:getById', id),
    create: (input: { title: string; content: string; format?: string; category?: string; tags?: string; isFavorite?: boolean }) =>
      ipcRenderer.invoke('snippet:create', input),
    update: (id: number, updates: { title?: string; content?: string; format?: string; category?: string; tags?: string; isFavorite?: boolean }) =>
      ipcRenderer.invoke('snippet:update', id, updates),
    delete: (id: number) => ipcRenderer.invoke('snippet:delete', id),
    toggleFavorite: (id: number) => ipcRenderer.invoke('snippet:toggleFavorite', id),
    search: (query: string) => ipcRenderer.invoke('snippet:search', query),
    getCategories: () => ipcRenderer.invoke('snippet:getCategories'),
    getFavorites: () => ipcRenderer.invoke('snippet:getFavorites')
  },
  webpage: {
    fetch: (url: string) => ipcRenderer.invoke('webpage:fetch', url) as Promise<string>
  },
  ftp: {
    connect: (config: any) => ipcRenderer.invoke('ftp:connect', config),
    disconnect: () => ipcRenderer.invoke('ftp:disconnect'),
    list: (path: string) => ipcRenderer.invoke('ftp:list', path),
    read: (path: string) => ipcRenderer.invoke('ftp:read', path),
    download: (remotePath: string, localPath: string) => ipcRenderer.invoke('ftp:download', remotePath, localPath),
    downloadToTemp: (remotePath: string, fileName: string) => ipcRenderer.invoke('ftp:download-to-temp', remotePath, fileName) as Promise<{ success: boolean; localPath?: string; error?: string }>,
    isConnected: () => ipcRenderer.invoke('ftp:is-connected')
  },
  pdf: {
    generateInvoice: (invoiceData: any) => ipcRenderer.invoke('pdf:generate-invoice', invoiceData) as Promise<{ success: boolean; buffer?: string; error?: string }>,
    saveInvoice: (invoiceData: any, suggestedName?: string) => ipcRenderer.invoke('pdf:save-invoice', invoiceData, suggestedName) as Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>,
    openFile: (filePath: string) => ipcRenderer.invoke('pdf:open-file', filePath) as Promise<{ success: boolean; error?: string }>
  },
  system: {
    getInfo: () => ipcRenderer.invoke('system:get-info') as Promise<{ username: string; hostname: string }>,
    getPlatform: () => ipcRenderer.invoke('system:get-platform') as Promise<string>
  },
  git: {
    execute: (cwd: string, args: string[]) => ipcRenderer.invoke('git:execute', cwd, args) as Promise<{ success: boolean; output: string; error: string }>
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

declare global {
  interface Window {
    electronAPI: typeof electronAPI
  }
}
