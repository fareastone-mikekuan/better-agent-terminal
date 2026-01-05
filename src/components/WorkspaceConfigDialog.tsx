import { useState } from 'react'
import type { Workspace, SkillShortcut, SkillShortcutType } from '../types'
import { generateSkillTemplate } from '../utils/workflow-parser'

interface WorkspaceConfigDialogProps {
  workspace: Workspace
  onSave: (updates: Partial<Workspace>) => void
  onClose: () => void
}

export function WorkspaceConfigDialog({
  workspace,
  onSave,
  onClose
}: Readonly<WorkspaceConfigDialogProps>) {
  const [isSkill, setIsSkill] = useState(workspace.isSkill || false)
  const [initCommand, setInitCommand] = useState(workspace.skillConfig?.initCommand || '')
  const [description, setDescription] = useState(workspace.skillConfig?.description || '')
  const [tags, setTags] = useState((workspace.skillConfig?.tags || []).join(', '))
  const [shortcuts, setShortcuts] = useState<SkillShortcut[]>(
    workspace.skillConfig?.shortcuts || []
  )
  const [editingShortcut, setEditingShortcut] = useState<SkillShortcut | null>(null)

  const handleSave = () => {
    const updates: Partial<Workspace> = {
      isSkill,
      skillConfig: isSkill ? {
        initCommand: initCommand.trim() || undefined,
        description: description.trim() || undefined,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        shortcuts: shortcuts.length > 0 ? shortcuts : undefined
      } : undefined
    }
    onSave(updates)
    onClose()
  }

  const handleAddShortcut = () => {
    setEditingShortcut({
      id: Date.now().toString(),
      label: '',
      type: 'terminal',
      command: '',
      icon: '▶️'
    })
  }

  const handleSaveShortcut = () => {
    if (!editingShortcut || !editingShortcut.label) return
    
    // 根據類型驗證必填欄位
    if (editingShortcut.type === 'terminal' && !editingShortcut.command) return
    if (editingShortcut.type === 'api' && (!editingShortcut.apiMethod || !editingShortcut.apiUrl)) return
    if (editingShortcut.type === 'db' && !editingShortcut.dbQuery) return
    if (editingShortcut.type === 'web' && !editingShortcut.webUrl) return
    if (editingShortcut.type === 'file' && (!editingShortcut.fileAction || !editingShortcut.filePath)) return
    if (editingShortcut.type === 'wait' && (!editingShortcut.waitCondition || !editingShortcut.waitTarget)) return
    
    const existingIndex = shortcuts.findIndex(s => s.id === editingShortcut.id)
    if (existingIndex >= 0) {
      const newShortcuts = [...shortcuts]
      newShortcuts[existingIndex] = editingShortcut
      setShortcuts(newShortcuts)
    } else {
      setShortcuts([...shortcuts, editingShortcut])
    }
    setEditingShortcut(null)
  }

  const handleDeleteShortcut = (id: string) => {
    setShortcuts(shortcuts.filter(s => s.id !== id))
  }

  const handleOpenSkillMd = async () => {
    const skillMdPath = `${workspace.folderPath}/skill.md`
    await window.electronAPI.shell.openExternal(skillMdPath)
  }

  const handleCreateSkillMd = async () => {
    const template = generateSkillTemplate(workspace.alias || workspace.name)
    
    const skillMdPath = `${workspace.folderPath}/skill.md`
    await window.electronAPI.fs.writeFile(skillMdPath, template)
    await handleOpenSkillMd()
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="workspace-config-dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>⚙️ 工作區配置</h2>
          <span className="dialog-subtitle">{workspace.alias || workspace.name}</span>
          <button className="dialog-close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="dialog-content" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {/* 技能模式開關 */}
          <div className="config-section">
            <label className="checkbox-label" style={{ fontSize: '16px', fontWeight: 'bold' }}>
              <input
                type="checkbox"
                checked={isSkill}
                onChange={e => setIsSkill(e.target.checked)}
              />
              <span>📚 這是一個技能工作區</span>
            </label>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '4px', marginLeft: '24px' }}>
              技能工作區可以定義快捷操作、初始化命令，並自動載入 skill.md 給 AI 理解上下文
            </p>
          </div>

          {/* 技能配置區（僅在啟用技能模式時顯示） */}
          {isSkill && (
            <>
              {/* skill.md 管理 */}
              <div className="config-section">
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  📄 skill.md
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleOpenSkillMd}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      backgroundColor: '#2d4a2d',
                      color: '#7bbda4',
                      border: '1px solid #7bbda4',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    📝 編輯 skill.md
                  </button>
                  <button
                    onClick={handleCreateSkillMd}
                    style={{
                      flex: 1,
                      padding: '8px 16px',
                      backgroundColor: '#3d2f1f',
                      color: '#f59e0b',
                      border: '1px solid #f59e0b',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '13px'
                    }}
                  >
                    ✨ 創建模板
                  </button>
                </div>
                <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                  skill.md 會自動被 AI 讀取作為上下文，幫助 AI 理解這個技能的功能和使用方式
                </p>
              </div>

              {/* 技能描述 */}
              <div className="config-section">
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  技能簡述（選填）
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="例如：計算客戶帳單的自動化工具"
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#2a2826',
                    color: '#dfdbc3',
                    border: '1px solid #3a3836',
                    borderRadius: '4px'
                  }}
                />
              </div>

              {/* 標籤 */}
              <div className="config-section">
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  標籤（選填，用逗號分隔）
                </label>
                <input
                  type="text"
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder="例如：財務, 自動化, 報表"
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#2a2826',
                    color: '#dfdbc3',
                    border: '1px solid #3a3836',
                    borderRadius: '4px'
                  }}
                />
              </div>

              {/* 初始化命令 */}
              <div className="config-section">
                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                  初始化命令（選填）
                </label>
                <input
                  type="text"
                  value={initCommand}
                  onChange={e => setInitCommand(e.target.value)}
                  placeholder="例如：npm install && npm run setup"
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#2a2826',
                    color: '#dfdbc3',
                    border: '1px solid #3a3836',
                    borderRadius: '4px',
                    fontFamily: 'monospace'
                  }}
                />
                <p style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
                  開啟此工作區時自動執行的命令
                </p>
              </div>

              {/* 快捷操作 */}
              <div className="config-section">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ fontWeight: 'bold' }}>快捷操作</label>
                  <button
                    onClick={handleAddShortcut}
                    style={{
                      padding: '4px 12px',
                      backgroundColor: '#7bbda4',
                      color: '#1f1d1a',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                  >
                    ＋ 新增
                  </button>
                </div>

                {/* 快捷操作列表 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {shortcuts.map(shortcut => {
                    // 根據類型生成摘要文字
                    let summary = ''
                    switch (shortcut.type) {
                      case 'terminal':
                        summary = shortcut.command || ''
                        break
                      case 'api':
                        summary = `${shortcut.apiMethod} ${shortcut.apiUrl}`
                        break
                      case 'db':
                        summary = shortcut.dbQuery || ''
                        break
                      case 'web':
                        summary = shortcut.webUrl || ''
                        break
                      case 'file':
                        summary = `${shortcut.fileAction} ${shortcut.filePath}`
                        break
                      case 'wait':
                        summary = `等待 ${shortcut.waitCondition}: ${shortcut.waitTarget}`
                        break
                    }
                    
                    return (
                      <div
                        key={shortcut.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '8px',
                          backgroundColor: '#2a2826',
                          borderRadius: '4px',
                          border: '1px solid #3a3836'
                        }}
                      >
                        <span style={{ fontSize: '16px' }}>{shortcut.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                            {shortcut.label}
                            <span style={{ 
                              marginLeft: '8px', 
                              fontSize: '10px', 
                              color: '#888',
                              textTransform: 'uppercase'
                            }}>
                              [{shortcut.type}]
                            </span>
                          </div>
                          <div style={{ fontSize: '11px', color: '#888', fontFamily: 'monospace' }}>
                            {summary}
                          </div>
                        </div>
                        <button
                          onClick={() => setEditingShortcut(shortcut)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'transparent',
                            color: '#7bbda4',
                            border: '1px solid #7bbda4',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          編輯
                        </button>
                        <button
                          onClick={() => handleDeleteShortcut(shortcut.id)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: 'transparent',
                            color: '#cb6077',
                            border: '1px solid #cb6077',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '11px'
                          }}
                        >
                          刪除
                        </button>
                      </div>
                    )
                  })}
                </div>

                {shortcuts.length === 0 && (
                  <p style={{ fontSize: '12px', color: '#666', textAlign: 'center', padding: '16px' }}>
                    尚未新增快捷操作
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="dialog-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '16px', borderTop: '1px solid var(--border-color)' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              color: '#888',
              border: '1px solid #3a3836',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              backgroundColor: '#7bbda4',
              color: '#1f1d1a',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            儲存
          </button>
        </div>
      </div>

      {/* 快捷操作編輯對話框 */}
      {editingShortcut && (
        <div className="dialog-overlay" onClick={() => setEditingShortcut(null)}>
          <div
            className="shortcut-edit-dialog"
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#1f1d1a',
              padding: '20px',
              borderRadius: '8px',
              border: '1px solid #3a3836',
              width: '500px',
              maxWidth: '90vw',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            <h3 style={{ marginBottom: '16px' }}>編輯快捷操作</h3>
            
            {/* 動作類型選擇 */}
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 'bold' }}>
                動作類型 *
              </label>
              <select
                value={editingShortcut.type}
                onChange={e => setEditingShortcut({ 
                  ...editingShortcut, 
                  type: e.target.value as SkillShortcutType 
                })}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#2a2826',
                  color: '#dfdbc3',
                  border: '1px solid #3a3836',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                <option value="terminal">🖥️ TERMINAL - 執行終端命令</option>
                <option value="api">🌐 API - 呼叫 API 請求</option>
                <option value="db">💾 DB - 執行資料庫查詢</option>
                <option value="web">🔗 WEB - 開啟網頁</option>
                <option value="file">📁 FILE - 文件操作</option>
                <option value="wait">⏱️ WAIT - 等待條件</option>
              </select>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>圖標</label>
              <input
                type="text"
                value={editingShortcut.icon || ''}
                onChange={e => setEditingShortcut({ ...editingShortcut, icon: e.target.value })}
                placeholder="▶️"
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#2a2826',
                  color: '#dfdbc3',
                  border: '1px solid #3a3836',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>按鈕文字 *</label>
              <input
                type="text"
                value={editingShortcut.label}
                onChange={e => setEditingShortcut({ ...editingShortcut, label: e.target.value })}
                placeholder="例如：執行分析"
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: '#2a2826',
                  color: '#dfdbc3',
                  border: '1px solid #3a3836',
                  borderRadius: '4px'
                }}
              />
            </div>

            {/* TERMINAL 類型欄位 */}
            {editingShortcut.type === 'terminal' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>終端命令 *</label>
                <input
                  type="text"
                  value={editingShortcut.command || ''}
                  onChange={e => setEditingShortcut({ ...editingShortcut, command: e.target.value })}
                  placeholder="例如：npm run build"
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#2a2826',
                    color: '#dfdbc3',
                    border: '1px solid #3a3836',
                    borderRadius: '4px',
                    fontFamily: 'monospace'
                  }}
                />
              </div>
            )}

            {/* API 類型欄位 */}
            {editingShortcut.type === 'api' && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>HTTP 方法 *</label>
                  <select
                    value={editingShortcut.apiMethod || 'GET'}
                    onChange={e => setEditingShortcut({ 
                      ...editingShortcut, 
                      apiMethod: e.target.value as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
                    })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#2a2826',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>API URL *</label>
                  <input
                    type="text"
                    value={editingShortcut.apiUrl || ''}
                    onChange={e => setEditingShortcut({ ...editingShortcut, apiUrl: e.target.value })}
                    placeholder="例如：http://localhost:3000/api/deploy"
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#2a2826',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>Request Body (JSON)</label>
                  <textarea
                    value={editingShortcut.apiBody || ''}
                    onChange={e => setEditingShortcut({ ...editingShortcut, apiBody: e.target.value })}
                    placeholder='{"key": "value"}'
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#2a2826',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </>
            )}

            {/* DB 類型欄位 */}
            {editingShortcut.type === 'db' && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>資料庫連線</label>
                  <input
                    type="text"
                    value={editingShortcut.dbConnection || ''}
                    onChange={e => setEditingShortcut({ ...editingShortcut, dbConnection: e.target.value })}
                    placeholder="連線名稱（選填，使用目前連線）"
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#2a2826',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px'
                    }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>SQL 查詢 *</label>
                  <textarea
                    value={editingShortcut.dbQuery || ''}
                    onChange={e => setEditingShortcut({ ...editingShortcut, dbQuery: e.target.value })}
                    placeholder="SELECT * FROM deployments ORDER BY created_at DESC LIMIT 1"
                    rows={4}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#2a2826',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </>
            )}

            {/* WEB 類型欄位 */}
            {editingShortcut.type === 'web' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>網頁 URL *</label>
                <input
                  type="text"
                  value={editingShortcut.webUrl || ''}
                  onChange={e => setEditingShortcut({ ...editingShortcut, webUrl: e.target.value })}
                  placeholder="例如：https://status.example.com/deploy"
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#2a2826',
                    color: '#dfdbc3',
                    border: '1px solid #3a3836',
                    borderRadius: '4px',
                    fontFamily: 'monospace'
                  }}
                />
              </div>
            )}

            {/* FILE 類型欄位 */}
            {editingShortcut.type === 'file' && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>文件操作 *</label>
                  <select
                    value={editingShortcut.fileAction || 'download'}
                    onChange={e => setEditingShortcut({ 
                      ...editingShortcut, 
                      fileAction: e.target.value as 'download' | 'upload' | 'open'
                    })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#2a2826',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="download">下載文件</option>
                    <option value="upload">上傳文件</option>
                    <option value="open">開啟文件</option>
                  </select>
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>文件路徑 *</label>
                  <input
                    type="text"
                    value={editingShortcut.filePath || ''}
                    onChange={e => setEditingShortcut({ ...editingShortcut, filePath: e.target.value })}
                    placeholder="例如：/logs/deploy.log"
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#2a2826',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>
              </>
            )}

            {/* WAIT 類型欄位 */}
            {editingShortcut.type === 'wait' && (
              <>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>等待條件 *</label>
                  <select
                    value={editingShortcut.waitCondition || 'log_contains'}
                    onChange={e => setEditingShortcut({ 
                      ...editingShortcut, 
                      waitCondition: e.target.value as 'log_contains' | 'api_status' | 'file_exists' | 'time'
                    })}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#2a2826',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    <option value="log_contains">LOG 包含關鍵字</option>
                    <option value="api_status">API 狀態</option>
                    <option value="file_exists">文件存在</option>
                    <option value="time">等待時間（秒）</option>
                  </select>
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>目標值 *</label>
                  <input
                    type="text"
                    value={editingShortcut.waitTarget || ''}
                    onChange={e => setEditingShortcut({ ...editingShortcut, waitTarget: e.target.value })}
                    placeholder={
                      editingShortcut.waitCondition === 'log_contains' ? '例如：Deployment completed' :
                      editingShortcut.waitCondition === 'time' ? '例如：30' :
                      editingShortcut.waitCondition === 'file_exists' ? '例如：/tmp/ready.flag' :
                      '例如：http://localhost:3000/health'
                    }
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#2a2826',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px',
                      fontFamily: 'monospace'
                    }}
                  />
                </div>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>超時時間（秒）</label>
                  <input
                    type="number"
                    value={editingShortcut.waitTimeout || 300}
                    onChange={e => setEditingShortcut({ ...editingShortcut, waitTimeout: parseInt(e.target.value) })}
                    placeholder="300"
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: '#2a2826',
                      color: '#dfdbc3',
                      border: '1px solid #3a3836',
                      borderRadius: '4px'
                    }}
                  />
                </div>
              </>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setEditingShortcut(null)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  color: '#888',
                  border: '1px solid #3a3836',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                取消
              </button>
              <button
                onClick={handleSaveShortcut}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#7bbda4',
                  color: '#1f1d1a',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                確定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
