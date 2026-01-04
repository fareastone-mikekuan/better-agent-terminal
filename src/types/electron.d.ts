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
  data: {
    export: () => Promise<string | null>
    import: () => Promise<string | null>
    saveToFile: (filePath: string, data: string) => Promise<boolean>
  }
  dialog: {
    selectFolder: () => Promise<string | null>
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
  system: {
    getInfo: () => Promise<{ username: string; hostname: string }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
