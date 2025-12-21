import type { AppSettings, ShellType, FontType, ColorPresetId, CopilotConfig } from '../types'
import { FONT_OPTIONS, COLOR_PRESETS } from '../types'

type Listener = () => void

const defaultSettings: AppSettings = {
  shell: 'auto',
  customShellPath: '',
  fontSize: 14,
  fontFamily: 'sf-mono',
  customFontFamily: '',
  theme: 'dark',
  colorPreset: 'novel',
  customBackgroundColor: '#1f1d1a',
  customForegroundColor: '#dfdbc3',
  customCursorColor: '#dfdbc3'
}

class SettingsStore {
  private settings: AppSettings = { ...defaultSettings }
  private copilotConfig: CopilotConfig | null = null
  private listeners: Set<Listener> = new Set()

  getSettings(): AppSettings {
    return this.settings
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.listeners.forEach(listener => listener())
  }

  setShell(shell: ShellType): void {
    this.settings = { ...this.settings, shell }
    this.notify()
    this.save()
  }

  setCustomShellPath(path: string): void {
    this.settings = { ...this.settings, customShellPath: path }
    this.notify()
    this.save()
  }

  setFontSize(size: number): void {
    this.settings = { ...this.settings, fontSize: size }
    this.notify()
    this.save()
  }

  setTheme(theme: 'dark' | 'light'): void {
    this.settings = { ...this.settings, theme }
    this.notify()
    this.save()
  }

  setFontFamily(fontFamily: FontType): void {
    this.settings = { ...this.settings, fontFamily }
    this.notify()
    this.save()
  }

  setCustomFontFamily(customFontFamily: string): void {
    this.settings = { ...this.settings, customFontFamily }
    this.notify()
    this.save()
  }

  setColorPreset(colorPreset: ColorPresetId): void {
    this.settings = { ...this.settings, colorPreset }
    this.notify()
    this.save()
  }

  setCustomBackgroundColor(customBackgroundColor: string): void {
    this.settings = { ...this.settings, customBackgroundColor }
    this.notify()
    this.save()
  }

  setCustomForegroundColor(customForegroundColor: string): void {
    this.settings = { ...this.settings, customForegroundColor }
    this.notify()
    this.save()
  }

  setCustomCursorColor(customCursorColor: string): void {
    this.settings = { ...this.settings, customCursorColor }
    this.notify()
    this.save()
  }

  // Get terminal colors based on preset or custom settings
  getTerminalColors(): { background: string; foreground: string; cursor: string } {
    if (this.settings.colorPreset === 'custom') {
      return {
        background: this.settings.customBackgroundColor,
        foreground: this.settings.customForegroundColor,
        cursor: this.settings.customCursorColor
      }
    }
    const preset = COLOR_PRESETS.find(p => p.id === this.settings.colorPreset)
    return preset || COLOR_PRESETS[0]
  }

  // Get the actual CSS font-family string based on settings
  getFontFamilyString(): string {
    if (this.settings.fontFamily === 'custom' && this.settings.customFontFamily) {
      return `"${this.settings.customFontFamily}", monospace`
    }
    const fontOption = FONT_OPTIONS.find(f => f.id === this.settings.fontFamily)
    return fontOption?.fontFamily || 'monospace'
  }

  async save(): Promise<void> {
    const data = JSON.stringify(this.settings)
    await window.electronAPI.settings.save(data)
  }

  async load(): Promise<void> {
    const data = await window.electronAPI.settings.load()
    if (data) {
      try {
        const parsed = JSON.parse(data)
        this.settings = { ...defaultSettings, ...parsed }
        this.notify()
      } catch (e) {
        console.error('Failed to parse settings:', e)
      }
    }

    // Load Copilot config from main process
    try {
      this.copilotConfig = await window.electronAPI.copilot.getConfig()
    } catch (e) {
      console.warn('Failed to load Copilot config:', e)
    }
  }

  // GitHub Copilot methods
  async setCopilotConfig(config: CopilotConfig): Promise<void> {
    this.copilotConfig = config
    await window.electronAPI.copilot.setConfig(config)
  }

  getCopilotConfig(): CopilotConfig | null {
    return this.copilotConfig
  }

  async isCopilotEnabled(): Promise<boolean> {
    return await window.electronAPI.copilot.isEnabled()
  }
}

export const settingsStore = new SettingsStore()
