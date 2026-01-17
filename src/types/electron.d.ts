import type { CreatePtyOptions } from './index'

interface ElectronAPI {
  pty: {
    create: (options: CreatePtyOptions) => Promise<boolean>
    write: (id: string, data: string) => Promise<void>
    resize: (id: string, cols: number, rows: number) => Promise<void>
    kill: (id: string) => Promise<boolean>
    restart: (id: string, cwd: string, shell?: string) => Promise<boolean>
    getCwd: (id: string) => Promise<string | null>
    startCapture: (id: string) => Promise<void>
    stopCapture: (id: string) => Promise<string>
    getCapture: (id: string) => Promise<string>
    onOutput: (callback: (id: string, data: string) => void) => () => void
    onExit: (callback: (id: string, exitCode: number) => void) => () => void
  }
  fs: {
    readFile: (filePath: string, cwd: string) => Promise<{ success: boolean; content?: string; error?: string }>
    writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  }
  workspace: {
    save: (data: string) => Promise<boolean>
    load: () => Promise<string | null>
  }
  settings: {
    save: (data: string) => Promise<boolean>
    load: () => Promise<string | null>
    getShellPath: (shell: string) => Promise<string>
  }
  skills: {
    save: (data: string) => Promise<boolean>
    load: () => Promise<string | null>
    loadSources: () => Promise<any[]>
    saveSources: (sources: any[]) => Promise<void>
  }
  data: {
    export: () => Promise<string | null>
    import: () => Promise<string | null>
    saveToFile: (filePath: string, data: string) => Promise<boolean>
  }
  dialog: {
    selectFolder: () => Promise<string | null>
  }
  shell: {
    openExternal: (path: string) => Promise<void>
  }
  terminal: {
    executeCommand: (workspaceId: string, command: string) => Promise<void>
  }
  skill: {
    executeApiCall: (params: { method: string; url: string; headers?: Record<string, string>; body?: string }) => Promise<{ success: boolean; data?: any; error?: string }>
    executeDbQuery: (params: { connection?: string; query: string }) => Promise<{ success: boolean; data?: any; error?: string }>
    openWebUrl: (url: string) => Promise<void>
    executeFileAction: (params: { action: 'download' | 'upload' | 'open'; path: string }) => Promise<{ success: boolean; error?: string }>
    waitForCondition: (params: { condition: string; target: string; timeout: number }) => Promise<{ success: boolean; error?: string }>
  }
  copilot: {
    setConfig: (config: any) => Promise<void>
    getConfig: () => Promise<any>
    isEnabled: () => Promise<boolean>
    chat: (chatId: string, options: any) => Promise<any>
    cancelChat: (chatId: string) => Promise<boolean>
    listModels: () => Promise<{ ids: string[]; error?: string }>
    openVSCodeTokenHelper: () => Promise<void>
    startDeviceFlow: () => Promise<{ userCode: string; verificationUri: string; deviceCode: string }>
    completeDeviceFlow: (deviceCode: string) => Promise<string>
  }
  webpage: {
    fetch: (url: string) => Promise<string>
  }
  selectionAI: {
    onRequest: (callback: (req: { requestId: string; mode: 'analyze' | 'draft'; text: string; url?: string; sourceTitle?: string; sourceType?: string }) => void) => () => void
  }
  system: {
    getInfo: () => Promise<{ username: string; hostname: string }>
  }

  m365: {
    getStatus: () => Promise<{
      signedIn: boolean
      expiresAt?: number
      scope?: string
      account?: { displayName?: string; userPrincipalName?: string }
    }>
    signOut: () => Promise<{ success: boolean }>
    startDeviceFlow: (params: { tenant?: string; clientId: string; scopes?: string[] }) => Promise<{
      deviceCode: string
      userCode: string
      verificationUri: string
      expiresIn: number
      interval: number
      message?: string
    }>
    completeDeviceFlow: (params: { tenant?: string; clientId: string; deviceCode: string }) => Promise<any>
    drive: {
      resolveShareLink: (params: { tenant?: string; clientId: string; shareUrl: string; scopes?: string[] }) => Promise<{
        driveId: string
        itemId: string
        name: string
        webUrl?: string
        isFolder: boolean
      }>
      listChildren: (params: { tenant?: string; clientId: string; driveId: string; itemId: string; scopes?: string[] }) => Promise<
        Array<{
          id: string
          name: string
          webUrl?: string
          size?: number
          lastModifiedDateTime?: string
          isFolder: boolean
          mimeType?: string
        }>
      >
      downloadItem: (params: { tenant?: string; clientId: string; driveId: string; itemId: string; scopes?: string[] }) => Promise<{
        name: string
        mimeType?: string
        base64: string
        size?: number
      }>
    }
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
