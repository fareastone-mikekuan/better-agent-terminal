import { BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import type { CreatePtyOptions } from '../src/types'

// Try to import @lydell/node-pty, fall back to child_process if not available
let pty: typeof import('@lydell/node-pty') | null = null
let ptyAvailable = false
try {
  pty = require('@lydell/node-pty')
  // Test if native module works by checking if spawn function exists and module is properly built
  if (pty && typeof pty.spawn === 'function') {
    ptyAvailable = true
    console.log('node-pty loaded successfully (using @lydell/node-pty)')
  } else {
    console.warn('node-pty loaded but spawn function not available')
  }
} catch (e) {
  console.warn('node-pty not available, falling back to child_process:', e)
}

interface PtyInstance {
  process: any // IPty or ChildProcess
  type: 'terminal'  // Unified to 'terminal' - agent types handled by agentPreset
  cwd: string
  usePty: boolean
  shell: string
  outputBuffer: string
  isCapturing: boolean
}

export class PtyManager {
  private instances: Map<string, PtyInstance> = new Map()
  private window: BrowserWindow

  constructor(window: BrowserWindow) {
    this.window = window
  }

  startCapture(id: string): void {
    const instance = this.instances.get(id)
    if (instance) {
      instance.isCapturing = true
      instance.outputBuffer = '' // Clear previous buffer
      console.log('[PtyManager] Started capture for terminal:', id)
    }
  }

  stopCapture(id: string): string {
    const instance = this.instances.get(id)
    if (instance) {
      instance.isCapturing = false
      const output = instance.outputBuffer
      instance.outputBuffer = ''
      console.log('[PtyManager] Stopped capture for terminal:', id, 'Output length:', output.length)
      return output
    }
    return ''
  }

  getCapture(id: string): string {
    const instance = this.instances.get(id)
    return instance?.outputBuffer || ''
  }

  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      const fs = require('fs')
      const path = require('path')
      const electron = require('electron')
      
      // 1. 優先使用專案內建的 PowerShell
      let projectRoot: string
      if (electron.app.isPackaged) {
        projectRoot = electron.app.getAppPath()
        if (projectRoot.includes('.asar')) {
          projectRoot = path.dirname(projectRoot)
        }
      } else {
        projectRoot = path.resolve(__dirname, '..')
      }
      
      const bundledPwsh = path.join(projectRoot, 'packages', 'PowerShell', 'pwsh.exe')
      if (fs.existsSync(bundledPwsh)) {
        console.log('[PtyManager] Using bundled pwsh at:', bundledPwsh)
        return bundledPwsh
      }
      
      // 2. 嘗試從 PATH 找 pwsh
      const { execSync } = require('child_process')
      try {
        const pwshPath = execSync('where pwsh', { encoding: 'utf8' }).trim().split('\n')[0]
        if (pwshPath) {
          console.log('[PtyManager] Found pwsh in PATH:', pwshPath)
          return pwshPath
        }
      } catch (e) {
        // pwsh not in PATH, try common install locations
        const pwshPaths = [
          'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
          'C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe',
          process.env.LOCALAPPDATA + '\\Microsoft\\WindowsApps\\pwsh.exe'
        ]
        for (const p of pwshPaths) {
          if (fs.existsSync(p)) {
            console.log('[PtyManager] Found pwsh at:', p)
            return p
          }
        }
      }
      
      // 3. Fallback 到 Windows PowerShell
      console.log('[PtyManager] Using Windows PowerShell')
      return 'powershell.exe'
    } else if (process.platform === 'darwin') {
      return process.env.SHELL || '/bin/zsh'
    } else {
      // Linux - detect available shell
      const fs = require('fs')
      if (process.env.SHELL) {
        return process.env.SHELL
      } else if (fs.existsSync('/bin/bash')) {
        return '/bin/bash'
      } else {
        return '/bin/sh'
      }
    }
  }

  create(options: CreatePtyOptions): boolean {
    const { id, cwd, type, shell: shellOverride, customEnv = {} } = options

    // ✅ 驗證目錄是否存在
    const fs = require('fs')
    if (!fs.existsSync(cwd)) {
      console.error(`[PtyManager] Directory does not exist: ${cwd}`)
      // 發送錯誤訊息到終端
      if (!this.window.isDestroyed()) {
        this.window.webContents.send('pty:output', id, 
          `\r\n⚠️  [錯誤] 工作目錄不存在：${cwd}\r\n` +
          `   這個工作區可能是從其他電腦匯入的。\r\n` +
          `   請關閉此工作區，或手動更改工作目錄。\r\n\r\n`
        )
        // 立即發送退出訊號，防止 UI 卡住
        this.window.webContents.send('pty:exit', id, 1)
      }
      return false
    }

    let shell = shellOverride || this.getDefaultShell()
    
    // If shell path is relative (contains path separators), resolve it from project root
    // Don't resolve bare command names like 'cmd.exe', 'powershell.exe' - they're in PATH
    const path = require('path')
    if (shell && !path.isAbsolute(shell) && (shell.includes('/') || shell.includes('\\'))) {
      const electron = require('electron')
      
      // In development: __dirname is in dist-electron/
      // In production: app.getAppPath() points to app.asar or unpacked folder
      let projectRoot: string
      
      if (electron.app.isPackaged) {
        // Production: use app path
        projectRoot = electron.app.getAppPath()
        // If in .asar, go up one level
        if (projectRoot.includes('.asar')) {
          projectRoot = path.dirname(projectRoot)
        }
      } else {
        // Development: go up from dist-electron to project root
        projectRoot = path.resolve(__dirname, '..')
      }
      
      shell = path.resolve(projectRoot, shell)
      console.log('[PtyManager] Resolved relative shell path:', shell)
    }
    
    let args: string[] = []

    // For PowerShell (pwsh or powershell), bypass execution policy to allow unsigned scripts
    if (shell.includes('powershell') || shell.includes('pwsh')) {
      args = ['-ExecutionPolicy', 'Bypass', '-NoLogo']
    }

    // Try node-pty first, fallback to child_process if it fails
    let usedPty = false

    if (ptyAvailable && pty) {
      try {
        // Set UTF-8 and terminal environment variables, merge custom env
        const envWithUtf8 = {
          ...process.env,
          ...customEnv,  // Merge custom environment variables
          // UTF-8 encoding
          LANG: 'en_US.UTF-8',
          LC_ALL: 'en_US.UTF-8',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        }

        const ptyProcess = pty.spawn(shell, args, {
          name: 'xterm-256color',
          cols: 120,
          rows: 30,
          cwd,
          env: envWithUtf8 as { [key: string]: string }
        })

        ptyProcess.onData((data: string) => {
          const instance = this.instances.get(id)
          if (instance?.isCapturing) {
            instance.outputBuffer += data
            console.log('[PtyManager] Captured data (length:', data.length, ')')
          }
          if (!this.window.isDestroyed()) {
            this.window.webContents.send('pty:output', id, data)
          }
        })

        ptyProcess.onExit(({ exitCode }: { exitCode: number }) => {
          if (!this.window.isDestroyed()) {
            this.window.webContents.send('pty:exit', id, exitCode)
          }
          this.instances.delete(id)
        })

        this.instances.set(id, { process: ptyProcess, type, cwd, usePty: true, shell, outputBuffer: '', isCapturing: false })
        usedPty = true
        console.log('Created terminal using node-pty')
      } catch (e) {
        console.warn('node-pty spawn failed, falling back to child_process:', e)
        ptyAvailable = false // Don't try again
      }
    }

    if (!usedPty) {
      try {
        // Fallback to child_process with proper stdio
        let shellArgs = [...args]
        if (shell.includes('powershell') || shell.includes('pwsh')) {
          // Use -NoExit for interactive mode and force UTF-8 encoding
          shellArgs.push(
            '-NoExit',
            '-Command',
            '[Console]::OutputEncoding=[Console]::InputEncoding=[System.Text.Encoding]::UTF8'
          )
        } else if (shell.toLowerCase().includes('cmd')) {
          // For cmd.exe, use /Q (quiet) and /K (keep running)
          shellArgs = ['/Q', '/K', 'chcp 65001 >nul']
        }

        // Set UTF-8 and terminal environment variables, merge custom env (child_process fallback)
        const envWithUtf8 = {
          ...process.env,
          ...customEnv,  // Merge custom environment variables
          // UTF-8 encoding
          LANG: 'en_US.UTF-8',
          LC_ALL: 'en_US.UTF-8',
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        }

        const childProcess = spawn(shell, shellArgs, {
          cwd,
          env: envWithUtf8 as NodeJS.ProcessEnv,
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false
        })

        childProcess.stdout?.on('data', (data: Buffer) => {
          const instance = this.instances.get(id)
          const output = data.toString('utf8')
          if (instance?.isCapturing) {
            instance.outputBuffer += output
          }
          if (!this.window.isDestroyed()) {
            this.window.webContents.send('pty:output', id, output)
          }
        })

        childProcess.stderr?.on('data', (data: Buffer) => {
          const instance = this.instances.get(id)
          const output = data.toString('utf8')
          if (instance?.isCapturing) {
            instance.outputBuffer += output
          }
          if (!this.window.isDestroyed()) {
            this.window.webContents.send('pty:output', id, output)
          }
        })

        childProcess.on('exit', (exitCode: number | null) => {
          if (!this.window.isDestroyed()) {
            this.window.webContents.send('pty:exit', id, exitCode ?? 0)
          }
          this.instances.delete(id)
        })

        childProcess.on('error', (error) => {
          console.error('Child process error:', error)
          if (!this.window.isDestroyed()) {
            this.window.webContents.send('pty:output', id, `\r\n[Error: ${error.message}]\r\n`)
          }
        })

        // Send initial message
        if (!this.window.isDestroyed()) {
          this.window.webContents.send('pty:output', id, `[Terminal - child_process mode]\r\n[Note: Backspace and arrow keys may not work. Install node-pty for full support]\r\n`)
        }

        this.instances.set(id, { process: childProcess, type, cwd, usePty: false, shell, outputBuffer: '', isCapturing: false })
        console.log('Created terminal using child_process fallback')
      } catch (error) {
        console.error('Failed to create terminal:', error)
        return false
      }
    }

    return true
  }

  write(id: string, data: string): void {
    const instance = this.instances.get(id)
    console.log('[PtyManager] write:', { id, hasInstance: !!instance, data: data.charCodeAt(0) })
    if (instance) {
      if (instance.usePty) {
        instance.process.write(data)
      } else {
        // For child_process, write to stdin
        const cp = instance.process as ChildProcess
        // Convert \r to \r\n for proper line ending on Windows
        const converted = data.replace(/\r(?!\n)/g, '\r\n')
        
        // For cmd.exe, manually echo input (except newlines)
        if (instance.shell.toLowerCase().includes('cmd')) {
          // Echo the input back for visual feedback
          if (!this.window.isDestroyed()) {
            this.window.webContents.send('pty:output', id, data)
          }
        }
        
        cp.stdin?.write(converted)
      }
    }
  }

  resize(id: string, cols: number, rows: number): void {
    const instance = this.instances.get(id)
    if (instance && instance.usePty) {
      instance.process.resize(cols, rows)
    }
  }

  kill(id: string): boolean {
    const instance = this.instances.get(id)
    if (instance) {
      try {
        if (instance.usePty) {
          // For PTY, use kill method
          instance.process.kill()
        } else {
          // For child_process, try graceful shutdown first
          const cp = instance.process as ChildProcess
          if (process.platform === 'win32') {
            // On Windows, use taskkill to ensure process tree is killed
            const { execSync } = require('child_process')
            try {
              if (cp.pid) {
                execSync(`taskkill /pid ${cp.pid} /T /F`, { timeout: 3000 })
              }
            } catch (e) {
              // If taskkill fails, try regular kill
              cp.kill('SIGKILL')
            }
          } else {
            // On Unix, kill the process group
            if (cp.pid) {
              try {
                process.kill(-cp.pid, 'SIGTERM')
                // Give it a moment, then force kill if needed
                setTimeout(() => {
                  try {
                    if (cp.pid) process.kill(-cp.pid, 'SIGKILL')
                  } catch (e) {
                    // Process already dead
                  }
                }, 1000)
              } catch (e) {
                cp.kill('SIGKILL')
              }
            } else {
              cp.kill('SIGKILL')
            }
          }
        }
      } catch (error) {
        console.error(`[PtyManager] Error killing terminal ${id}:`, error)
      } finally {
        this.instances.delete(id)
      }
      return true
    }
    return false
  }

  restart(id: string, cwd: string, shell?: string): boolean {
    const instance = this.instances.get(id)
    if (instance) {
      const type = instance.type
      this.kill(id)
      return this.create({ id, cwd, type, shell })
    }
    return false
  }

  getCwd(id: string): string | null {
    const instance = this.instances.get(id)
    if (instance) {
      return instance.cwd
    }
    return null
  }

  dispose(): void {
    console.log(`[PtyManager] Disposing ${this.instances.size} terminal instances...`)
    const instanceIds = Array.from(this.instances.keys())
    
    for (const id of instanceIds) {
      try {
        console.log(`[PtyManager] Killing terminal: ${id}`)
        this.kill(id)
      } catch (error) {
        console.error(`[PtyManager] Failed to kill terminal ${id}:`, error)
      }
    }
    
    this.instances.clear()
    console.log('[PtyManager] All terminals disposed')
  }
}
