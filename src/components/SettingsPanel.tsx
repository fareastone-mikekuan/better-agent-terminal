import { useState, useEffect } from 'react'
import type { AppSettings, ShellType, FontType, ColorPresetId } from '../types'
import { FONT_OPTIONS, COLOR_PRESETS } from '../types'
import { settingsStore } from '../stores/settings-store'
import { EnvVarEditor } from './EnvVarEditor'
import { AGENT_PRESETS, AgentPresetId } from '../types/agent-presets'

interface SettingsPanelProps {
  onClose: () => void
}

// Check if a font is available using CSS Font Loading API
const checkFontAvailable = (fontFamily: string): boolean => {
  // Extract the primary font name (first in the list)
  const fontName = fontFamily.split(',')[0].trim().replace(/['"]/g, '')
  if (fontName === 'monospace') return true

  try {
    return document.fonts.check(`12px "${fontName}"`)
  } catch {
    return false
  }
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState<AppSettings>(settingsStore.getSettings())
  const [availableFonts, setAvailableFonts] = useState<Set<FontType>>(new Set())
  const [copilotConfig, setCopilotConfig] = useState<CopilotConfig>({
    enabled: false,
    apiKey: '',
    organizationSlug: ''
  })
  const [authLoading, setAuthLoading] = useState(false)
  const [authMessage, setAuthMessage] = useState('')
  const [userCode, setUserCode] = useState('') // Store user code separately for better display
  const [deviceCode, setDeviceCode] = useState('') // Store device code for manual completion

  useEffect(() => {
    return settingsStore.subscribe(() => {
      setSettings(settingsStore.getSettings())
    })
  }, [])

  // Load Copilot config
  useEffect(() => {
    const loadCopilotConfig = async () => {
      const config = settingsStore.getCopilotConfig()
      if (config) {
        setCopilotConfig(config)
      }
    }
    loadCopilotConfig()
  }, [])

  // Check font availability on mount
  useEffect(() => {
    const checkFonts = async () => {
      // Wait for fonts to be loaded
      await document.fonts.ready

      const available = new Set<FontType>()
      for (const font of FONT_OPTIONS) {
        if (font.id === 'system' || font.id === 'custom' || checkFontAvailable(font.fontFamily)) {
          available.add(font.id)
        }
      }
      setAvailableFonts(available)
    }
    checkFonts()
  }, [])

  const handleShellChange = (shell: ShellType) => {
    settingsStore.setShell(shell)
  }

  const handleCustomPathChange = (path: string) => {
    settingsStore.setCustomShellPath(path)
  }

  const handleFontSizeChange = (size: number) => {
    settingsStore.setFontSize(size)
  }

  const handleFontFamilyChange = (fontFamily: FontType) => {
    settingsStore.setFontFamily(fontFamily)
  }

  const handleCustomFontFamilyChange = (customFontFamily: string) => {
    settingsStore.setCustomFontFamily(customFontFamily)
  }

  const handleColorPresetChange = (colorPreset: ColorPresetId) => {
    settingsStore.setColorPreset(colorPreset)
  }

  const handleCustomBackgroundColorChange = (color: string) => {
    settingsStore.setCustomBackgroundColor(color)
  }

  const handleCustomForegroundColorChange = (color: string) => {
    settingsStore.setCustomForegroundColor(color)
  }

  const handleCustomCursorColorChange = (color: string) => {
    settingsStore.setCustomCursorColor(color)
  }

  const handleCopilotEnabledChange = async (enabled: boolean) => {
    const newConfig = { ...copilotConfig, enabled }
    setCopilotConfig(newConfig)
    await settingsStore.setCopilotConfig(newConfig)
    await window.electronAPI.copilot.setConfig(newConfig)
  }

  const handleCopilotModelChange = async (model: string) => {
    const newConfig = { ...copilotConfig, model }
    setCopilotConfig(newConfig)
    await settingsStore.setCopilotConfig(newConfig)
    await window.electronAPI.copilot.setConfig(newConfig)
  }

  const handleLogout = async () => {
    const newConfig = {
      enabled: false,
      apiKey: '',
      organizationSlug: ''
    }
    setCopilotConfig(newConfig)
    await settingsStore.setCopilotConfig(newConfig)
    await window.electronAPI.copilot.setConfig(newConfig)
    setAuthMessage('✅ 已登出 GitHub Copilot')
  }

  const handleManualComplete = async () => {
    if (!deviceCode) {
      setAuthMessage('❌ 請先點擊「GitHub 登入」按鈕')
      return
    }

    try {
      setAuthLoading(true)
      setAuthMessage('正在檢查授權狀態...')
      
      const token = await window.electronAPI.copilot.completeDeviceFlow(deviceCode)
      
      // Save the OAuth token and enable Copilot
      const newConfig = { 
        ...copilotConfig, 
        enabled: true,
        apiKey: token
      }
      
      setCopilotConfig(newConfig)
      await settingsStore.setCopilotConfig(newConfig)
      await window.electronAPI.copilot.setConfig(newConfig)
      
      setAuthMessage('✅ 授權成功！GitHub Copilot 已啟用')
      setUserCode('')
      setDeviceCode('')
      setAuthLoading(false)
    } catch (error: any) {
      if (error.message === 'PENDING') {
        setAuthMessage('⚠️ 請先在瀏覽器中完成授權，然後再點擊此按鈕')
      } else {
        setAuthMessage(`❌ 授權失敗: ${error.message}`)
      }
      setAuthLoading(false)
    }
  }

  const handleGitHubLogin = async () => {
    try {
      setAuthLoading(true)
      setAuthMessage('正在啟動 GitHub 認證...')
      setUserCode('') // Clear previous user code
      
      const deviceFlow = await window.electronAPI.copilot.startDeviceFlow()
      setUserCode(deviceFlow.userCode) // Store user code for display
      setDeviceCode(deviceFlow.deviceCode) // Store device code for manual completion
      setAuthMessage(`請在打開的瀏覽器中輸入上方代碼，或授權後點擊下方「我已授權」按鈕`)
      
      // 自動開啟瀏覽器
      window.open(deviceFlow.verificationUri, '_blank')
      
      // 輪詢檢查授權狀態
      let attempts = 0
      const maxAttempts = 60 // 5 minutes (5 seconds * 60)
      
      const checkAuth = async (): Promise<boolean> => {
        if (attempts >= maxAttempts) {
          setAuthMessage('⚠️ 自動檢測逾時，請點擊下方「我已授權」按鈕手動完成')
          setAuthLoading(false)
          return false
        }
        
        try {
          const token = await window.electronAPI.copilot.completeDeviceFlow(deviceFlow.deviceCode)
          
          // Save the OAuth token and enable Copilot
          const newConfig = { 
            ...copilotConfig, 
            enabled: true,
            apiKey: token // Save the OAuth token
          }
          
          // Update local state
          setCopilotConfig(newConfig)
          
          // Save to store and notify backend
          await settingsStore.setCopilotConfig(newConfig)
          await window.electronAPI.copilot.setConfig(newConfig)
          
          // Show success message
          setAuthMessage('✅ 授權成功！GitHub Copilot 已啟用')
          setUserCode('') // Clear user code on success
          setDeviceCode('') // Clear device code on success
          setAuthLoading(false)
          return true
        } catch (error: any) {
          if (error.message === 'PENDING') {
            // Authorization still pending, continue polling
            attempts++
            await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
            return checkAuth()
          } else {
            // Real error occurred
            setAuthMessage(`授權失敗: ${error.message}`)
            setAuthLoading(false)
            return false
          }
        }
      }
      
      await checkAuth()
    } catch (error: any) {
      setAuthMessage(`錯誤: ${error.message}`)
      setAuthLoading(false)
    }
  }

  const terminalColors = settingsStore.getTerminalColors()

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-content">
          {/* GitHub Copilot Section */}
          <div className="settings-section">
            <h3>🤖 GitHub Copilot</h3>
            <div className="settings-group">
              <label>
                <input
                  type="checkbox"
                  checked={copilotConfig.enabled}
                  onChange={e => handleCopilotEnabledChange(e.target.checked)}
                />
                Enable GitHub Copilot
              </label>
            </div>

            {/* Show login status and logout button if already logged in */}
            {copilotConfig.apiKey && !authLoading && (
              <div className="settings-group">
                <div style={{
                  padding: '12px',
                  backgroundColor: '#2d4a2d',
                  borderRadius: '4px',
                  marginBottom: '10px'
                }}>
                  <div style={{ color: '#7bbda4', fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>
                    ✅ 已登入 GitHub Copilot
                  </div>
                  <small style={{ color: '#888' }}>
                    Token: {copilotConfig.apiKey.substring(0, 20)}...
                  </small>
                </div>

                {/* Model selector */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#dfdbc3' }}>
                    選擇模型 (Model)
                  </label>
                  <select
                    value={copilotConfig.model || 'gpt-4o'}
                    onChange={e => handleCopilotModelChange(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#2a2826',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px',
                      fontSize: '14px'
                    }}
                  >
                    <optgroup label="🔥 推薦 (Recommended)">
                      <option value="gpt-4o">GPT-4o (Default)</option>
                      <option value="claude-3.5-sonnet">Claude 3.5 Sonnet</option>
                      <option value="o1-preview">O1 Preview</option>
                      <option value="o1-mini">O1 Mini</option>
                    </optgroup>
                    <optgroup label="🤖 GPT Models">
                      <option value="gpt-4o-mini">GPT-4o Mini</option>
                      <option value="gpt-4">GPT-4</option>
                      <option value="gpt-4-turbo">GPT-4 Turbo</option>
                      <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    </optgroup>
                    <optgroup label="🚀 Claude Models">
                      <option value="claude-3-opus">Claude 3 Opus</option>
                      <option value="claude-3-sonnet">Claude 3 Sonnet</option>
                      <option value="claude-3-haiku">Claude 3 Haiku</option>
                    </optgroup>
                    <optgroup label="🌟 Google Models">
                      <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash Exp</option>
                      <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                      <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                    </optgroup>
                  </select>
                  <small style={{ color: '#888', display: 'block', marginTop: '4px' }}>
                    💡 不同模型有不同特性與速度
                  </small>
                </div>

                <button 
                  onClick={handleLogout}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#cb6077',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    width: '100%'
                  }}
                >
                  🚪 登出
                </button>
              </div>
            )}

            {/* Show login button if not logged in */}
            {!copilotConfig.apiKey && !authLoading && (
              <div className="settings-group">
                <button 
                  onClick={handleGitHubLogin}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#7bbda4',
                    color: '#1f1d1a',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    width: '100%'
                  }}
                >
                  🔐 GitHub 登入
                </button>
                <small style={{ color: '#888', display: 'block', marginTop: '8px' }}>
                  使用 GitHub OAuth 認證以啟用 Copilot
                </small>
              </div>
            )}

            {/* Display User Code prominently */}
            {userCode && (
              <div className="settings-group">
                <div style={{
                  padding: '20px',
                  backgroundColor: '#1e3a8a',
                  borderRadius: '8px',
                  border: '3px solid #3b82f6',
                  textAlign: 'center'
                }}>
                  <div style={{ color: '#93c5fd', fontSize: '12px', marginBottom: '8px', fontWeight: 'bold' }}>
                    請在瀏覽器中輸入此代碼：
                  </div>
                  <div style={{
                    fontSize: '32px',
                    fontWeight: 'bold',
                    color: '#ffffff',
                    letterSpacing: '8px',
                    fontFamily: 'monospace',
                    padding: '10px',
                    backgroundColor: '#1e40af',
                    borderRadius: '4px',
                    userSelect: 'all'
                  }}>
                    {userCode}
                  </div>
                  <div style={{ color: '#93c5fd', fontSize: '11px', marginTop: '8px' }}>
                    💡 點擊代碼可複製
                  </div>
                </div>
                
                {/* Manual completion button */}
                <button 
                  onClick={handleManualComplete}
                  disabled={authLoading}
                  style={{
                    marginTop: '10px',
                    padding: '10px 20px',
                    width: '100%',
                    backgroundColor: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: authLoading ? 'not-allowed' : 'pointer',
                    fontWeight: 'bold',
                    opacity: authLoading ? 0.5 : 1
                  }}
                >
                  {authLoading ? '⏳ 檢查中...' : '✅ 我已授權，完成設定'}
                </button>
              </div>
            )}

            {authMessage && (
              <div className="settings-group">
                <div style={{
                  padding: '10px',
                  backgroundColor: authMessage.includes('✅') ? '#2d4a2d' : '#4a3d2d',
                  borderRadius: '4px',
                  color: '#dfdbc3',
                  fontSize: '14px'
                }}>
                  {authMessage}
                </div>
              </div>
            )}

            {copilotConfig.enabled && (
              <>
                <div className="settings-group">
                  <label>GitHub Token (PAT) - 可選</label>
                  <input
                    type="password"
                    value={copilotConfig.apiKey}
                    onChange={e => handleCopilotApiKeyChange(e.target.value)}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  />
                  <small style={{ color: '#888', marginTop: '4px', display: 'block' }}>
                    Generate at: <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer" style={{ color: '#7bbda4' }}>github.com/settings/tokens</a> (需要 'copilot' scope)
                  </small>
                </div>

                <div className="settings-group">
                  <label>Organization Slug (Optional)</label>
                  <input
                    type="text"
                    value={copilotConfig.organizationSlug || ''}
                    onChange={e => handleCopilotOrgSlugChange(e.target.value)}
                    placeholder="your-organization"
                  />
                  <small style={{ color: '#888', marginTop: '4px', display: 'block' }}>
                    僅在使用組織版 Copilot 時需要
                  </small>
                </div>
              </>
            )}
          </div>

          <div className="settings-section">
            <h3>Shell</h3>
            <div className="settings-group">
              <label>Default Shell</label>
              <select
                value={settings.shell}
                onChange={e => handleShellChange(e.target.value as ShellType)}
              >
                <option value="auto">Auto (prefer pwsh)</option>
                <option value="pwsh">PowerShell 7 (pwsh)</option>
                <option value="powershell">Windows PowerShell</option>
                <option value="cmd">Command Prompt (cmd)</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            {settings.shell === 'custom' && (
              <div className="settings-group">
                <label>Custom Shell Path</label>
                <input
                  type="text"
                  value={settings.customShellPath}
                  onChange={e => handleCustomPathChange(e.target.value)}
                  placeholder="C:\path\to\shell.exe"
                />
              </div>
            )}

            <div className="settings-group">
              <label>Default Terminals per Workspace: {settings.defaultTerminalCount || 1}</label>
              <input
                type="range"
                min="1"
                max="5"
                value={settings.defaultTerminalCount || 1}
                onChange={e => settingsStore.setDefaultTerminalCount(Number(e.target.value))}
              />
            </div>

            <div className="settings-group checkbox-group">
              <label>
                <input
                  type="checkbox"
                  checked={settings.createDefaultAgentTerminal === true}
                  onChange={e => settingsStore.setCreateDefaultAgentTerminal(e.target.checked)}
                />
                Create Agent Terminal by default
              </label>
              <p className="settings-hint">When enabled, new workspaces will include an Agent Terminal.</p>
            </div>

            {settings.createDefaultAgentTerminal && (
              <>
                <div className="settings-group">
                  <label>Default Agent</label>
                  <select
                    value={settings.defaultAgent || 'claude-code'}
                    onChange={e => settingsStore.setDefaultAgent(e.target.value as AgentPresetId)}
                  >
                    {AGENT_PRESETS.filter(p => p.id !== 'none').map(preset => (
                      <option key={preset.id} value={preset.id}>
                        {preset.icon} {preset.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="settings-group checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.agentAutoCommand === true}
                      onChange={e => settingsStore.setAgentAutoCommand(e.target.checked)}
                    />
                    Auto-run agent command
                  </label>
                  <p className="settings-hint">Automatically execute the agent command (e.g., `claude`) when creating an Agent Terminal.</p>
                </div>
              </>
            )}
          </div>

          <div className="settings-section">
            <h3>🌐 WebView Settings</h3>
            <div className="settings-group">
              <label>Embedded WebView URL</label>
              <input
                type="text"
                value={settings.webViewUrl || ''}
                onChange={e => settingsStore.setWebViewUrl(e.target.value)}
                placeholder="http://example.com"
              />
              <p className="settings-hint">URL for the embedded webpage in the right panel. Leave empty to hide WebView.</p>
            </div>
          </div>

          <div className="settings-section">
            <h3>Appearance</h3>
            <div className="settings-group">
              <label>Font Size: {settings.fontSize}px</label>
              <input
                type="range"
                min="10"
                max="24"
                value={settings.fontSize}
                onChange={e => handleFontSizeChange(Number(e.target.value))}
              />
            </div>

            <div className="settings-group">
              <label>Font Family</label>
              <select
                value={settings.fontFamily}
                onChange={e => handleFontFamilyChange(e.target.value as FontType)}
              >
                {FONT_OPTIONS.map(font => (
                  <option key={font.id} value={font.id} disabled={!availableFonts.has(font.id) && font.id !== 'custom'}>
                    {font.name} {availableFonts.has(font.id) ? '✓' : '(not installed)'}
                  </option>
                ))}
              </select>
            </div>

            {settings.fontFamily === 'custom' && (
              <div className="settings-group">
                <label>Custom Font Name</label>
                <input
                  type="text"
                  value={settings.customFontFamily}
                  onChange={e => handleCustomFontFamilyChange(e.target.value)}
                  placeholder="e.g., Fira Code, JetBrains Mono"
                />
              </div>
            )}

            <div className="settings-group">
              <label>Color Theme</label>
              <select
                value={settings.colorPreset}
                onChange={e => handleColorPresetChange(e.target.value as ColorPresetId)}
              >
                {COLOR_PRESETS.map(preset => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            {settings.colorPreset === 'custom' && (
              <>
                <div className="settings-group color-picker-group">
                  <label>Background Color</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={settings.customBackgroundColor}
                      onChange={e => handleCustomBackgroundColorChange(e.target.value)}
                    />
                    <input
                      type="text"
                      value={settings.customBackgroundColor}
                      onChange={e => handleCustomBackgroundColorChange(e.target.value)}
                      placeholder="#1f1d1a"
                    />
                  </div>
                </div>

                <div className="settings-group color-picker-group">
                  <label>Text Color</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={settings.customForegroundColor}
                      onChange={e => handleCustomForegroundColorChange(e.target.value)}
                    />
                    <input
                      type="text"
                      value={settings.customForegroundColor}
                      onChange={e => handleCustomForegroundColorChange(e.target.value)}
                      placeholder="#dfdbc3"
                    />
                  </div>
                </div>

                <div className="settings-group color-picker-group">
                  <label>Cursor Color</label>
                  <div className="color-input-wrapper">
                    <input
                      type="color"
                      value={settings.customCursorColor}
                      onChange={e => handleCustomCursorColorChange(e.target.value)}
                    />
                    <input
                      type="text"
                      value={settings.customCursorColor}
                      onChange={e => handleCustomCursorColorChange(e.target.value)}
                      placeholder="#dfdbc3"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="settings-group font-preview">
              <label>Preview</label>
              <div
                className="font-preview-box"
                style={{
                  fontFamily: settingsStore.getFontFamilyString(),
                  fontSize: settings.fontSize,
                  backgroundColor: terminalColors.background,
                  color: terminalColors.foreground
                }}
              >
                $ echo "Hello World" 你好世界 0123456789
              </div>
            </div>
          </div>

          <div className="settings-section">
            <h3>Environment Variables</h3>
            <p className="settings-hint" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              Global environment variables applied to ALL workspaces. Workspace-specific variables (⚙ button) will override these.
            </p>
            <EnvVarEditor
              envVars={settings.globalEnvVars || []}
              onAdd={(envVar) => settingsStore.addGlobalEnvVar(envVar)}
              onRemove={(key) => settingsStore.removeGlobalEnvVar(key)}
              onUpdate={(key, updates) => settingsStore.updateGlobalEnvVar(key, updates)}
            />
          </div>
        </div>

        <div className="settings-footer">
          <p className="settings-note">Changes are saved automatically. Font changes apply immediately to all terminals.</p>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              backgroundColor: '#7bbda4',
              color: '#1f1d1a',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px',
              marginTop: '12px'
            }}
          >
            ✓ 完成
          </button>
        </div>
      </div>
    </div>
  )
}
