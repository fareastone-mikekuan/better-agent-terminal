import { useState, useEffect } from 'react'
import type { AppSettings, ShellType, FontType, ColorPresetId, CopilotConfig } from '../types'
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
  const [activeTab, setActiveTab] = useState<'copilot' | 'gist' | 'panel' | 'shell' | 'web' | 'appearance' | 'env'>('copilot')
  const [settings, setSettings] = useState<AppSettings>(settingsStore.getSettings())
  const [availableFonts, setAvailableFonts] = useState<Set<FontType>>(new Set())
  const [copilotConfig, setCopilotConfig] = useState<CopilotConfig>({
    enabled: false,
    provider: 'github',
    apiKey: '',
    organizationSlug: ''
  })
  const [availableCopilotModels, setAvailableCopilotModels] = useState<string[]>([])
  const [copilotModelsLoading, setCopilotModelsLoading] = useState(false)
  const [copilotModelsError, setCopilotModelsError] = useState<string>('')
  const [gistToken, setGistToken] = useState('')
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
        // 确保有 provider 字段，如果没有则默认为 github
        setCopilotConfig({
          ...config,
          provider: config.provider || 'github'
        })
      }
    }
    loadCopilotConfig()
    
    // Load Gist Token
    const savedGistToken = localStorage.getItem('gist_token') || ''
    setGistToken(savedGistToken)
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

  // Load Copilot models dynamically from api.githubcopilot.com/models
  useEffect(() => {
    const shouldLoad =
      copilotConfig.enabled &&
      copilotConfig.provider === 'github' &&
      !!copilotConfig.apiKey &&
      !authLoading

    if (!shouldLoad) {
      setAvailableCopilotModels([])
      setCopilotModelsError('')
      return
    }

    let cancelled = false

    const loadModels = async () => {
      try {
        setCopilotModelsLoading(true)
        setCopilotModelsError('')

        const result = await window.electronAPI.copilot.listModels()
        if (cancelled) return

        if (result?.error) {
          setAvailableCopilotModels([])
          setCopilotModelsError(result.error)
          return
        }

        const ids = Array.isArray(result?.ids) ? result.ids : []
        setAvailableCopilotModels(ids)
      } catch (e: any) {
        if (cancelled) return
        setAvailableCopilotModels([])
        setCopilotModelsError(e?.message || String(e))
      } finally {
        if (!cancelled) setCopilotModelsLoading(false)
      }
    }

    loadModels()

    return () => {
      cancelled = true
    }
  }, [copilotConfig.enabled, copilotConfig.provider, copilotConfig.apiKey, authLoading])

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

  const handleCopilotProviderChange = async (provider: 'github' | 'm365') => {
    const newConfig = { ...copilotConfig, provider }
    setCopilotConfig(newConfig)
    await settingsStore.setCopilotConfig(newConfig)
    await window.electronAPI.copilot.setConfig(newConfig)
  }

  const handleGistTokenChange = (token: string) => {
    setGistToken(token)
    localStorage.setItem('gist_token', token)
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
  
    const handleCopyOAuthToken = async () => {
      const token = (copilotConfig.apiKey || '').trim()
      if (!token) {
        setAuthMessage('❌ 目前沒有可複製的 OAuth token（請先完成 GitHub 登入）')
        return
      }
  
      try {
        await navigator.clipboard.writeText(token)
        setAuthMessage('✅ 已複製 OAuth token 到剪貼簿')
      } catch {
        // Fallback: allow manual copy if clipboard API is not available
        window.prompt('請複製 OAuth token：', token)
      }
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
        apiKey: token,
        model: copilotConfig.model || 'gpt-4o' // 设置默认模型
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
            apiKey: token, // Save the OAuth token
            model: copilotConfig.model || 'gpt-4o' // 设置默认模型
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

  // Handle export all data
  const handleExportData = async () => {
    try {
      const success = await settingsStore.exportAllData()
      if (success) {
        alert('✅ 數據匯出成功！')
      } else {
        alert('❌ 匯出已取消或失敗')
      }
    } catch (error) {
      console.error('Export error:', error)
      alert('❌ 匯出失敗：' + (error as Error).message)
    }
  }

  // Handle import all data
  const handleImportData = async () => {
    const confirmed = confirm(
      '⚠️ 匯入將會覆蓋所有現有數據（設定、工作區、CHAT對話、筆記等）\n\n' +
      '建議先匯出當前數據作為備份。\n\n' +
      '確定要繼續嗎？'
    )
    
    if (!confirmed) return

    try {
      const success = await settingsStore.importAllData()
      if (success) {
        alert('✅ 數據匯入成功！\n\n頁面將重新載入以套用變更。')
        // 延迟一下确保文件写入完成
        setTimeout(() => {
          window.location.reload()
        }, 100)
      } else {
        alert('❌ 匯入已取消或失敗')
      }
    } catch (error) {
      console.error('Import error:', error)
      alert('❌ 匯入失敗：' + (error as Error).message)
    }
  }

  const terminalColors = settingsStore.getTerminalColors()

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>設定</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        {/* Tab Navigation */}
        <div style={{ 
          display: 'flex', 
          gap: '8px',
          padding: '0 16px',
          borderBottom: '1px solid #3a3836',
          backgroundColor: '#1f1d1a'
        }}>
          <button
            onClick={() => setActiveTab('copilot')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'copilot' ? '2px solid #7bbda4' : '2px solid transparent',
              color: activeTab === 'copilot' ? '#dfdbc3' : '#888',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'copilot' ? 'bold' : 'normal'
            }}
          >
            🤖 Copilot
          </button>
          <button
            onClick={() => setActiveTab('gist')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'gist' ? '2px solid #7bbda4' : '2px solid transparent',
              color: activeTab === 'gist' ? '#dfdbc3' : '#888',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'gist' ? 'bold' : 'normal'
            }}
          >
            📦 Gist
          </button>
          <button
            onClick={() => setActiveTab('panel')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'panel' ? '2px solid #7bbda4' : '2px solid transparent',
              color: activeTab === 'panel' ? '#dfdbc3' : '#888',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'panel' ? 'bold' : 'normal'
            }}
          >
            🔗 面板共用
          </button>
          <button
            onClick={() => setActiveTab('shell')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'shell' ? '2px solid #7bbda4' : '2px solid transparent',
              color: activeTab === 'shell' ? '#dfdbc3' : '#888',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'shell' ? 'bold' : 'normal'
            }}
          >
            Shell
          </button>
          <button
            onClick={() => setActiveTab('web')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'web' ? '2px solid #7bbda4' : '2px solid transparent',
              color: activeTab === 'web' ? '#dfdbc3' : '#888',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'web' ? 'bold' : 'normal'
            }}
          >
            🌐 網頁視窗
          </button>
          <button
            onClick={() => setActiveTab('appearance')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'appearance' ? '2px solid #7bbda4' : '2px solid transparent',
              color: activeTab === 'appearance' ? '#dfdbc3' : '#888',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'appearance' ? 'bold' : 'normal'
            }}
          >
            Appearance
          </button>
          <button
            onClick={() => setActiveTab('env')}
            style={{
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'env' ? '2px solid #7bbda4' : '2px solid transparent',
              color: activeTab === 'env' ? '#dfdbc3' : '#888',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: activeTab === 'env' ? 'bold' : 'normal'
            }}
          >
            🌍 環境變數
          </button>
        </div>

        <div className="settings-content">
          {/* Copilot Tab */}
          {activeTab === 'copilot' && (
          <div className="settings-section" style={{ backgroundColor: '#2a2826', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <h3>🤖 Copilot 設定</h3>
            <div className="settings-group">
              <label>
                <input
                  type="checkbox"
                  checked={copilotConfig.enabled}
                  onChange={e => handleCopilotEnabledChange(e.target.checked)}
                />
                啟用 Copilot
              </label>
            </div>

            {/* Provider Selector */}
            {copilotConfig.enabled && (
              <div className="settings-group">
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#dfdbc3' }}>
                  🔌 Copilot 來源 (Provider)
                </label>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <button
                    onClick={() => handleCopilotProviderChange('github')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      backgroundColor: copilotConfig.provider === 'github' ? '#2d4a2d' : '#2a2826',
                      color: copilotConfig.provider === 'github' ? '#7bbda4' : '#888',
                      border: `2px solid ${copilotConfig.provider === 'github' ? '#7bbda4' : '#3a3836'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '13px'
                    }}
                  >
                    🐙 GitHub Copilot
                  </button>
                  <button
                    onClick={() => handleCopilotProviderChange('m365')}
                    style={{
                      flex: 1,
                      padding: '10px',
                      backgroundColor: copilotConfig.provider === 'm365' ? '#2d4a2d' : '#2a2826',
                      color: copilotConfig.provider === 'm365' ? '#7bbda4' : '#888',
                      border: `2px solid ${copilotConfig.provider === 'm365' ? '#7bbda4' : '#3a3836'}`,
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      fontSize: '13px'
                    }}
                  >
                    🟦 M365 Copilot
                  </button>
                </div>
              </div>
            )}

            {/* GitHub Copilot Config */}
            {copilotConfig.enabled && copilotConfig.provider === 'github' && copilotConfig.apiKey && !authLoading && (
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
                    disabled={copilotModelsLoading}
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
                    {(() => {
                      const selected = copilotConfig.model || 'gpt-4o'
                      const list = Array.isArray(availableCopilotModels) ? availableCopilotModels : []
                      const merged = list.includes(selected) ? list : [selected, ...list]
                      const unique = Array.from(new Set(merged.filter(Boolean)))
                      return unique.map(id => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))
                    })()}
                  </select>
                  <small style={{ color: '#888', display: 'block', marginTop: '4px' }}>
                    {copilotModelsLoading
                      ? '⏳ 正在載入可用模型…'
                      : copilotModelsError
                        ? `⚠️ 無法載入模型列表：${copilotModelsError}`
                        : availableCopilotModels.length
                          ? `✅ 已載入 ${availableCopilotModels.length} 個模型`
                          : '💡 尚未載入模型列表'}
                  </small>
                </div>

                {/* Knowledge Selection Mode */}
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#dfdbc3' }}>
                    知識庫選擇模式
                  </label>
                  <select
                    value={copilotConfig.knowledgeSelectionMode || 'ai'}
                    onChange={async e => {
                      const newConfig = { 
                        ...copilotConfig, 
                        knowledgeSelectionMode: e.target.value as 'keyword' | 'ai'
                      }
                      setCopilotConfig(newConfig)
                      await settingsStore.setCopilotConfig(newConfig)
                    }}
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
                    <option value="ai">🤖 AI 智能選擇（推薦，更準確但消耗更多 Token）</option>
                    <option value="keyword">🔍 關鍵詞匹配（快速但可能不準確）</option>
                  </select>
                  <small style={{ color: '#888', display: 'block', marginTop: '4px' }}>
                    💡 AI 模式：每次提問前先用 AI 分析並選擇相關知識庫，然後再回答問題（兩次 API 調用）
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
            {copilotConfig.enabled && copilotConfig.provider === 'github' && !copilotConfig.apiKey && !authLoading && (
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
            {copilotConfig.provider === 'github' && userCode && (
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

            {copilotConfig.enabled && copilotConfig.provider === 'github' && (
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
                    <br />
                    用途：Copilot Chat
                  </small>
                  <button 
                    onClick={handleCopyOAuthToken}
                    style={{
                      marginTop: '10px',
                      padding: '8px 16px',
                      backgroundColor: '#7bbda4',
                      color: '#1f1d1a',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                      width: '100%'
                    }}
                  >
                    📋 複製 OAuth Token
                  </button>
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

            {/* M365 Copilot Configuration */}
            {copilotConfig.enabled && copilotConfig.provider === 'm365' && (
              <div className="settings-group">
                <div style={{
                  padding: '20px',
                  backgroundColor: '#2a2826',
                  borderRadius: '8px',
                  border: '2px solid #3a3836'
                }}>
                  <h4 style={{ color: '#7bbda4', marginBottom: '15px', fontSize: '16px' }}>
                    🟦 M365 Copilot 設定
                  </h4>
                  
                  {/* Tenant ID */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#dfdbc3' }}>
                      Tenant ID (租戶ID)
                    </label>
                    <input
                      type="text"
                      value={copilotConfig.m365Config?.tenantId || ''}
                      onChange={e => {
                        const newConfig = {
                          ...copilotConfig,
                          m365Config: {
                            ...copilotConfig.m365Config,
                            tenantId: e.target.value,
                            clientId: copilotConfig.m365Config?.clientId || '',
                          }
                        }
                        setCopilotConfig(newConfig)
                        settingsStore.setCopilotConfig(newConfig)
                      }}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: '#1f1d1a',
                        color: '#dfdbc3',
                        border: '1px solid #3a3836',
                        borderRadius: '4px',
                        fontSize: '14px',
                        fontFamily: 'monospace'
                      }}
                    />
                    <small style={{ color: '#888', display: 'block', marginTop: '4px' }}>
                      從 Azure Portal 獲取
                    </small>
                  </div>

                  {/* Client ID */}
                  <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#dfdbc3' }}>
                      Client ID (應用程式ID)
                    </label>
                    <input
                      type="text"
                      value={copilotConfig.m365Config?.clientId || ''}
                      onChange={e => {
                        const newConfig = {
                          ...copilotConfig,
                          m365Config: {
                            ...copilotConfig.m365Config,
                            tenantId: copilotConfig.m365Config?.tenantId || '',
                            clientId: e.target.value,
                          }
                        }
                        setCopilotConfig(newConfig)
                        settingsStore.setCopilotConfig(newConfig)
                      }}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      style={{
                        width: '100%',
                        padding: '10px',
                        backgroundColor: '#1f1d1a',
                        color: '#dfdbc3',
                        border: '1px solid #3a3836',
                        borderRadius: '4px',
                        fontSize: '14px',
                        fontFamily: 'monospace'
                      }}
                    />
                    <small style={{ color: '#888', display: 'block', marginTop: '4px' }}>
                      從 Azure AD App Registration 獲取
                    </small>
                  </div>

                  {/* Login Status or Login Button */}
                  {copilotConfig.m365Config?.accessToken ? (
                    <div style={{
                      padding: '15px',
                      backgroundColor: '#2d4a2d',
                      borderRadius: '6px',
                      marginBottom: '10px'
                    }}>
                      <div style={{ color: '#7bbda4', fontSize: '14px', fontWeight: 'bold', marginBottom: '4px' }}>
                        ✅ 已登入 M365 Copilot
                      </div>
                      <small style={{ color: '#888' }}>
                        Token 有效期至: {copilotConfig.m365Config.tokenExpiry 
                          ? new Date(copilotConfig.m365Config.tokenExpiry).toLocaleString('zh-TW')
                          : '未知'}
                      </small>
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        const tenantId = copilotConfig.m365Config?.tenantId
                        const clientId = copilotConfig.m365Config?.clientId
                        
                        if (!tenantId || !clientId) {
                          setAuthMessage('❌ 請先填寫 Tenant ID 和 Client ID')
                          return
                        }
                        
                        setAuthLoading(true)
                        setAuthMessage('🔄 正在開啟 Microsoft 登入視窗...')
                        
                        try {
                          // TODO: 實作 M365 OAuth
                          // await window.electronAPI.copilot.startM365OAuth(tenantId, clientId)
                          setAuthMessage('⚠️ M365 OAuth 功能開發中...')
                          
                          // 暫時的模擬登入（供測試UI用）
                          // const newConfig = {
                          //   ...copilotConfig,
                          //   m365Config: {
                          //     ...copilotConfig.m365Config,
                          //     accessToken: 'test_token',
                          //     tokenExpiry: Date.now() + 3600000
                          //   }
                          // }
                          // setCopilotConfig(newConfig)
                          // settingsStore.setCopilotConfig(newConfig)
                          // setAuthMessage('✅ M365 Copilot 已啟用')
                        } catch (error) {
                          setAuthMessage(`❌ 登入失敗: ${(error as Error).message}`)
                        } finally {
                          setAuthLoading(false)
                        }
                      }}
                      disabled={authLoading}
                      style={{
                        width: '100%',
                        padding: '12px 20px',
                        backgroundColor: authLoading ? '#555' : '#0078d4',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: authLoading ? 'not-allowed' : 'pointer',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      {authLoading ? '⏳ 處理中...' : '🔐 使用 Microsoft 帳號登入'}
                    </button>
                  )}

                  {/* Logout Button */}
                  {copilotConfig.m365Config?.accessToken && (
                    <button
                      onClick={() => {
                        const newConfig = {
                          ...copilotConfig,
                          m365Config: {
                            tenantId: copilotConfig.m365Config?.tenantId || '',
                            clientId: copilotConfig.m365Config?.clientId || '',
                          }
                        }
                        setCopilotConfig(newConfig)
                        settingsStore.setCopilotConfig(newConfig)
                        setAuthMessage('✅ 已登出 M365 Copilot')
                      }}
                      style={{
                        width: '100%',
                        padding: '10px 20px',
                        backgroundColor: '#cb6077',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        marginTop: '10px'
                      }}
                    >
                      🚪 登出
                    </button>
                  )}

                  <div style={{ 
                    marginTop: '15px', 
                    padding: '10px', 
                    backgroundColor: '#3a3836', 
                    borderRadius: '4px',
                    fontSize: '12px',
                    color: '#888'
                  }}>
                    <strong style={{ color: '#dfdbc3' }}>📝 設定說明：</strong>
                    <ol style={{ marginTop: '8px', marginBottom: '0', paddingLeft: '20px' }}>
                      <li>在 Azure Portal 註冊應用程式</li>
                      <li>獲取 Tenant ID 和 Client ID</li>
                      <li>配置重定向 URI: http://localhost:3000/callback</li>
                      <li>點擊登入按鈕完成 OAuth 授權</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </div>
          )}

          {/* Gist Tab */}
          {activeTab === 'gist' && (
          <div className="settings-section" style={{ backgroundColor: '#252321', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <h3>📦 GitHub Gist</h3>
            <div className="settings-group">
              <label>GitHub Token (用於 Gist 分享)</label>
              <input
                type="password"
                value={gistToken}
                onChange={e => handleGistTokenChange(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              />
              <small style={{ color: '#888', marginTop: '4px', display: 'block' }}>
                前往 <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" style={{ color: '#7bbda4' }}>github.com/settings/tokens/new</a> 建立 Token
                <br />
                權限：勾選 <strong>gist</strong> (Create gists)
                <br />
                用途：上傳和導入 Snippet 片段到 GitHub Gist
              </small>
            </div>
          </div>
          )}

          {/* Panel Sharing Tab */}
          {activeTab === 'panel' && (
          <div className="settings-section" style={{ backgroundColor: '#2a2826', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
            <h3>🔗 面板共用設定</h3>
            <p style={{ color: '#888', fontSize: '13px', marginBottom: '15px' }}>
              設定各功能面板是「所有工作區共用」還是「每個工作區獨立」
            </p>
            
            {/* 三列兩欄的網格布局 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              {/* Copilot 面板 */}
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '10px',
                backgroundColor: '#2a2826',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>💬</span>
                  <span style={{ color: '#dfdbc3', fontSize: '14px' }}>Copilot 面板</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {settings.sharedPanels?.copilot !== false ? '共用' : '獨立'}
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.sharedPanels?.copilot !== false}
                    onChange={e => {
                      settingsStore.setSettings({
                        ...settings,
                        sharedPanels: {
                          ...settings.sharedPanels,
                          copilot: e.target.checked
                        }
                      })
                    }}
                    style={{ width: '18px', height: '18px' }}
                  />
                </div>
              </label>

              {/* FILE 面板 */}
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '10px',
                backgroundColor: '#2a2826',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>📁</span>
                  <span style={{ color: '#dfdbc3', fontSize: '14px' }}>FILE 面板</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {settings.sharedPanels?.fileExplorer !== false ? '共用' : '獨立'}
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.sharedPanels?.fileExplorer !== false}
                    onChange={e => {
                      settingsStore.setSettings({
                        ...settings,
                        sharedPanels: {
                          ...settings.sharedPanels,
                          fileExplorer: e.target.checked
                        }
                      })
                    }}
                    style={{ width: '18px', height: '18px' }}
                  />
                </div>
              </label>

              {/* API 測試器 */}
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '10px',
                backgroundColor: '#2a2826',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🌐</span>
                  <span style={{ color: '#dfdbc3', fontSize: '14px' }}>API 測試器</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {settings.sharedPanels?.apiTester !== false ? '共用' : '獨立'}
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.sharedPanels?.apiTester !== false}
                    onChange={e => {
                      settingsStore.setSettings({
                        ...settings,
                        sharedPanels: {
                          ...settings.sharedPanels,
                          apiTester: e.target.checked
                        }
                      })
                    }}
                    style={{ width: '18px', height: '18px' }}
                  />
                </div>
              </label>

              {/* 資料庫連線 */}
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '10px',
                backgroundColor: '#2a2826',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🗄️</span>
                  <span style={{ color: '#dfdbc3', fontSize: '14px' }}>資料庫連線</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {settings.sharedPanels?.oracle !== false ? '共用' : '獨立'}
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.sharedPanels?.oracle !== false}
                    onChange={e => {
                      settingsStore.setSettings({
                        ...settings,
                        sharedPanels: {
                          ...settings.sharedPanels,
                          oracle: e.target.checked
                        }
                      })
                    }}
                    style={{ width: '18px', height: '18px' }}
                  />
                </div>
              </label>

              {/* 網頁視窗 */}
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '10px',
                backgroundColor: '#2a2826',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>🌐</span>
                  <span style={{ color: '#dfdbc3', fontSize: '14px' }}>網頁視窗</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {settings.sharedPanels?.webView !== false ? '共用' : '獨立'}
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.sharedPanels?.webView !== false}
                    onChange={e => {
                      settingsStore.setSettings({
                        ...settings,
                        sharedPanels: {
                          ...settings.sharedPanels,
                          webView: e.target.checked
                        }
                      })
                    }}
                    style={{ width: '18px', height: '18px' }}
                  />
                </div>
              </label>

              {/* 筆記面板 */}
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '10px',
                backgroundColor: '#2a2826',
                borderRadius: '6px',
                cursor: 'pointer'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '18px' }}>📋</span>
                  <span style={{ color: '#dfdbc3', fontSize: '14px' }}>筆記面板</span>
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#888' }}>
                    {settings.sharedPanels?.snippets !== false ? '共用' : '獨立'}
                  </span>
                  <input
                    type="checkbox"
                    checked={settings.sharedPanels?.snippets !== false}
                    onChange={e => {
                      settingsStore.setSettings({
                        ...settings,
                        sharedPanels: {
                          ...settings.sharedPanels,
                          snippets: e.target.checked
                        }
                      })
                    }}
                    style={{ width: '18px', height: '18px' }}
                  />
                </div>
              </label>
            </div>

            <div style={{ 
              marginTop: '12px', 
              padding: '10px', 
              backgroundColor: '#3a3836', 
              borderRadius: '4px',
              fontSize: '12px',
              color: '#888'
            }}>
              <strong style={{ color: '#f59e0b' }}>⚠️ 注意：</strong>
              <ul style={{ marginTop: '8px', marginBottom: '0', paddingLeft: '20px' }}>
                <li>✅ <strong>共用</strong>：所有工作區看到相同的內容（例如 Copilot 聊天記錄、FILE 連線列表）</li>
                <li>🔒 <strong>獨立</strong>：每個工作區有自己的獨立內容，切換工作區時內容不會混淆</li>
                <li>💾 更改設定後會立即生效，現有內容會保留在共用模式中</li>
              </ul>
            </div>
          </div>
          )}

          {/* Shell Tab */}
          {activeTab === 'shell' && (
          <div className="settings-section">
            <h3>Shell</h3>
            
            {/* Shell 設定：Default Shell + Custom Path + Default Terminals per Workspace 排成一列 */}
            <div style={{ display: 'grid', gridTemplateColumns: settings.shell === 'custom' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '16px', marginBottom: '8px' }}>
              <div className="settings-group" style={{ marginBottom: 0 }}>
                <label>預設 Shell</label>
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
                <div className="settings-group" style={{ marginBottom: 0 }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>自訂 Shell 路徑</span>
                    <button
                      onClick={() => handleCustomPathChange('packages/PowerShell/pwsh.exe')}
                      style={{
                        padding: '2px 8px',
                        fontSize: '11px',
                        background: '#4a9eff',
                        border: 'none',
                        borderRadius: '3px',
                        color: '#fff',
                        cursor: 'pointer'
                      }}
                      title="使用專案內建的 PowerShell 7.5.4"
                    >
                      使用內建 PS
                    </button>
                  </label>
                  <input
                    type="text"
                    value={settings.customShellPath}
                    onChange={e => handleCustomPathChange(e.target.value)}
                    placeholder="例如: packages/PowerShell/pwsh.exe (支援相對路徑)"
                  />
                  <div style={{ fontSize: '11px', color: '#999', marginTop: '4px' }}>
                    提示：可使用相對路徑（如 packages/PowerShell/...）或絕對路徑
                  </div>
                </div>
              )}

              <div className="settings-group" style={{ marginBottom: 0 }}>
                <label>每個工作區的預設終端機數量: {settings.defaultTerminalCount || 1}</label>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={settings.defaultTerminalCount || 1}
                  onChange={e => settingsStore.setDefaultTerminalCount(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Agent 設定：預設建立 + Agent 選擇 + 自動執行 排成一列 */}
            <div style={{ display: 'grid', gridTemplateColumns: settings.createDefaultAgentTerminal ? '1fr 1fr 1fr' : '1fr', gap: '16px', marginBottom: '8px', marginTop: '16px' }}>
              <div className="settings-group checkbox-group" style={{ marginBottom: 0 }}>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.createDefaultAgentTerminal === true}
                    onChange={e => settingsStore.setCreateDefaultAgentTerminal(e.target.checked)}
                  />
                  預設建立 Agent 終端機
                </label>
              </div>

              {settings.createDefaultAgentTerminal && (
                <>
                  <div className="settings-group" style={{ marginBottom: 0 }}>
                    <label>Agent</label>
                    <select
                      value={settings.defaultAgent || 'copilot'}
                      onChange={e => settingsStore.setDefaultAgent(e.target.value as AgentPresetId)}
                    >
                      <option value="copilot">
                        🐙 GitHub Copilot
                      </option>
                    </select>
                  </div>

                  <div className="settings-group checkbox-group" style={{ marginBottom: 0 }}>
                    <label>
                      <input
                        type="checkbox"
                        checked={settings.agentAutoCommand === true}
                        onChange={e => settingsStore.setAgentAutoCommand(e.target.checked)}
                      />
                      自動執行 Agent 命令
                    </label>
                  </div>
                </>
              )}
            </div>

            {/* 說明文字放在下方 */}
            <div style={{ marginTop: '12px' }}>
              <p className="settings-hint" style={{ marginBottom: '8px' }}>
                <strong>預設建立 Agent 終端機：</strong>啟用後，新工作區會自動包含一個 Agent 終端機。
              </p>
              {settings.createDefaultAgentTerminal && (
                <p className="settings-hint">
                  <strong>自動執行 Agent 命令：</strong>建立 Agent 終端機時自動執行 Agent 命令（例如：`gh copilot`）。
                </p>
              )}
            </div>
          </div>
          )}

          {/* Web Tab */}
          {activeTab === 'web' && (
          <div className="settings-section">
            <h3>🌐 網頁視窗設定</h3>
            <div className="settings-group">
              <label>嵌入網頁 URL</label>
              <input
                type="text"
                value={settings.webViewUrl || ''}
                onChange={e => settingsStore.setWebViewUrl(e.target.value)}
                placeholder="http://example.com"
              />
              <p className="settings-hint">右側面板嵌入網頁的 URL。留空則隱藏 WebView。</p>
            </div>
          </div>
          )}

          {/* Appearance Tab */}
          {activeTab === 'appearance' && (
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

            {/* Theme Selection */}
            <div className="settings-group" style={{ marginBottom: '16px' }}>
              <label>介面主題</label>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => settingsStore.setTheme('dark')}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: settings.theme === 'dark' ? '#0078d4' : 'transparent',
                    color: settings.theme === 'dark' ? '#fff' : 'var(--text-primary)',
                    border: '2px solid ' + (settings.theme === 'dark' ? '#0078d4' : 'var(--border-color)'),
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.2s'
                  }}
                >
                  🌙 深色模式
                </button>
                <button
                  onClick={() => settingsStore.setTheme('light')}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: settings.theme === 'light' ? '#0078d4' : 'transparent',
                    color: settings.theme === 'light' ? '#fff' : 'var(--text-primary)',
                    border: '2px solid ' + (settings.theme === 'light' ? '#0078d4' : 'var(--border-color)'),
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    transition: 'all 0.2s'
                  }}
                >
                  ☀️ 淺色模式
                </button>
              </div>
            </div>

            {/* Font Family, Color Theme, Preview in one row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div className="settings-group" style={{ marginBottom: 0 }}>
                <label>字型</label>
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

              <div className="settings-group" style={{ marginBottom: 0 }}>
                <label>配色主題</label>
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

              <div className="settings-group font-preview" style={{ marginBottom: 0 }}>
                <label>預覽</label>
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

            {settings.fontFamily === 'custom' && (
              <div className="settings-group">
                <label>自訂字型名稱</label>
                <input
                  type="text"
                  value={settings.customFontFamily}
                  onChange={e => handleCustomFontFamilyChange(e.target.value)}
                  placeholder="例如：Fira Code, JetBrains Mono"
                />
              </div>
            )}

            {settings.colorPreset === 'custom' && (
              <>
                <div className="settings-group color-picker-group">
                  <label>背景顏色</label>
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
                  <label>文字顏色</label>
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
                  <label>游標顏色</label>
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
          </div>
          )}

          {/* Environment Variables Tab */}
          {activeTab === 'env' && (
          <div className="settings-section">
            <h3>🌍 環境變數</h3>
            <p className="settings-hint" style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
              全域環境變數套用到所有工作區。工作區特定變數（⚙ 按鈕）會覆蓋這些設定。
            </p>
            <EnvVarEditor
              envVars={settings.globalEnvVars || []}
              onAdd={(envVar) => settingsStore.addGlobalEnvVar(envVar)}
              onRemove={(key) => settingsStore.removeGlobalEnvVar(key)}
              onUpdate={(key, updates) => settingsStore.updateGlobalEnvVar(key, updates)}
            />
          </div>
          )}
        </div>

        <div className="settings-footer">
          {/* Data Backup Section */}
          <div className="settings-section">
            <h3>💾 數據備份</h3>
            <div className="settings-group">
              <p style={{ fontSize: '13px', color: '#888', marginBottom: '12px' }}>
                匯出或匯入所有數據，包含設定、工作區、終端狀態、CHAT 對話記錄、筆記等。
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleExportData}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: '#2d4a2d',
                    color: '#7bbda4',
                    border: '1px solid #7bbda4',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  📦 匯出所有數據
                </button>
                <button
                  onClick={handleImportData}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: '#3d2f1f',
                    color: '#f59e0b',
                    border: '1px solid #f59e0b',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  📥 匯入數據
                </button>
              </div>
              <p style={{ fontSize: '11px', color: '#666', marginTop: '8px', fontStyle: 'italic' }}>
                💡 提示：定期備份可防止數據丟失，也可用於跨機器同步設定
              </p>
            </div>
          </div>

          <p className="settings-note">所有變更會自動儲存。字型變更會立即套用到所有終端機。</p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
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
    </div>
  )
}
