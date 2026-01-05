import { useState } from 'react'
import type { Workspace } from '../types'
import { parseWorkflowFromMarkdown } from '../utils/workflow-parser'

interface SkillLibraryPanelProps {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  onOpenSkill: (workspaceId: string) => void
  onEditSkill: (workspaceId: string) => void
  onDuplicateSkill: (workspaceId: string) => void
  onDeleteSkill: (workspaceId: string) => void
  onExecuteWorkflow?: (workspace: Workspace, content: string) => void  // 新增：向上傳遞執行事件
}

export function SkillLibraryPanel({
  workspaces,
  activeWorkspaceId,
  onOpenSkill,
  onEditSkill,
  onDuplicateSkill,
  onDeleteSkill,
  onExecuteWorkflow
}: Readonly<SkillLibraryPanelProps>) {
  console.log('[SkillLibraryPanel] 渲染開始')
  console.log('[SkillLibraryPanel] workspaces 數量:', workspaces.length)
  console.log('[SkillLibraryPanel] workspaces:', workspaces.map(ws => ({
    id: ws.id,
    name: ws.name,
    isSkill: ws.skillConfig?.isSkill,
    hasWorkflow: !!ws.skillConfig?.workflow
  })))
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [loadingWorkflowId, setLoadingWorkflowId] = useState<string | null>(null)

  // 監控 executingWorkflow 狀態變化 - 移除，由 App.tsx 處理

  // 篩選出技能工作區
  const skillWorkspaces = workspaces.filter(ws => ws.skillConfig?.isSkill)
  
  console.log('[SkillLibraryPanel] skillWorkspaces 數量:', skillWorkspaces.length)
  if (skillWorkspaces.length > 0) {
    console.log('[SkillLibraryPanel] skillWorkspaces:', skillWorkspaces.map(ws => ({
      name: ws.name,
      alias: ws.alias,
      path: ws.folderPath
    })))
  }

  // 收集所有標籤
  const allTags = Array.from(
    new Set(
      skillWorkspaces.flatMap(ws => ws.skillConfig?.tags || [])
    )
  ).sort()

  // 篩選技能
  const filteredSkills = skillWorkspaces.filter(ws => {
    // 搜尋篩選
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchName = (ws.alias || ws.name).toLowerCase().includes(query)
      const matchDesc = ws.skillConfig?.description?.toLowerCase().includes(query)
      const matchTags = ws.skillConfig?.tags?.some(tag => tag.toLowerCase().includes(query))
      if (!matchName && !matchDesc && !matchTags) return false
    }

    // 標籤篩選
    if (selectedTag && !ws.skillConfig?.tags?.includes(selectedTag)) {
      return false
    }

    return true
  })

  const handleOpenSkillFolder = async (folderPath: string) => {
    await window.electronAPI.shell.openExternal(folderPath)
  }

  const handleExecuteWorkflow = async (workspace: Workspace) => {
    setLoadingWorkflowId(workspace.id)
    try {
      console.log('開始執行工作流程，工作區:', workspace.name, workspace.folderPath)
      
      // 讀取 skill.md
      const skillMdPath = `${workspace.folderPath}/skill.md`
      console.log('讀取 skill.md:', skillMdPath)
      
      const result = await window.electronAPI.fs.readFile(skillMdPath, workspace.folderPath)
      console.log('讀取結果:', result)
      
      if (result.success && result.content) {
        console.log('skill.md 內容長度:', result.content.length)
        
        // 解析工作流程
        const steps = parseWorkflowFromMarkdown(result.content)
        console.log('解析到的步驟數:', steps.length)
        console.log('解析到的步驟:', steps)
        
        if (steps.length === 0) {
          alert(`找不到工作流程步驟\n\n請確認 skill.md 中有 ## Workflow 區塊，並按照格式定義步驟：\n\n1. [TERMINAL] echo "Hello" - 測試命令\n2. [API] GET https://httpbin.org/get - 測試 API`)
          setLoadingWorkflowId(null)
          return
        }
        
        // 切換到該工作區
        onOpenSkill(workspace.id)
        
        // 稍微延遲一下再開啟執行器，確保工作區切換完成
        setTimeout(() => {
          console.log('設置 executingWorkflow 狀態')
          console.log('workspace:', workspace)
          console.log('content length:', result.content.length)
          
          // 向上傳遞執行事件給 App.tsx
          if (onExecuteWorkflow) {
            onExecuteWorkflow(workspace, result.content)
          }
          
          setLoadingWorkflowId(null)
        }, 300)
      } else {
        console.error('讀取 skill.md 失敗:', result)
        alert(`找不到 skill.md 文件\n\n路徑: ${skillMdPath}\n錯誤: ${result.error || '檔案不存在'}\n\n請確認：\n1. skill.md 文件存在於工作區目錄下\n2. 檔案名稱拼寫正確（全小寫）`)
        setLoadingWorkflowId(null)
      }
    } catch (error) {
      console.error('執行工作流程失敗:', error)
      alert('載入工作流程失敗: ' + error)
      setLoadingWorkflowId(null)
    }
  }

  if (skillWorkspaces.length === 0) {
    return (
      <div className="skill-library-panel" style={{ 
        padding: '40px 20px', 
        textAlign: 'center',
        color: '#888'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📚</div>
        <h3 style={{ marginBottom: '8px', color: '#dfdbc3' }}>尚無技能</h3>
        <p style={{ fontSize: '14px', marginBottom: '16px' }}>
          將工作區標記為「技能」即可在此管理
        </p>
        <p style={{ fontSize: '12px', color: '#666' }}>
          💡 在工作區右鍵選單中點擊「⚙ 配置」，勾選「這是一個技能工作區」
        </p>
      </div>
    )
  }

  return (
    <div className="skill-library-panel" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100%',
      backgroundColor: 'var(--bg-primary)'
    }}>
      {/* 標題 */}
      <div style={{ 
        padding: '16px', 
        borderBottom: '1px solid var(--border-color)',
        backgroundColor: 'var(--bg-secondary)'
      }}>
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 'bold' }}>
          📚 技能庫 ({filteredSkills.length})
        </h3>
      </div>

      {/* 搜尋和篩選 */}
      <div style={{ padding: '12px', borderBottom: '1px solid var(--border-color)' }}>
        {/* 搜尋框 */}
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="🔍 搜尋技能名稱、描述或標籤..."
          style={{
            width: '100%',
            padding: '8px 12px',
            backgroundColor: '#2a2826',
            color: '#dfdbc3',
            border: '1px solid #3a3836',
            borderRadius: '4px',
            fontSize: '13px',
            marginBottom: '8px'
          }}
        />

        {/* 標籤篩選 */}
        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedTag(null)}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                backgroundColor: selectedTag === null ? '#7bbda4' : 'transparent',
                color: selectedTag === null ? '#1f1d1a' : '#888',
                border: `1px solid ${selectedTag === null ? '#7bbda4' : '#3a3836'}`,
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: selectedTag === null ? 'bold' : 'normal'
              }}
            >
              全部
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag === selectedTag ? null : tag)}
                style={{
                  padding: '4px 10px',
                  fontSize: '11px',
                  backgroundColor: selectedTag === tag ? '#7bbda4' : 'transparent',
                  color: selectedTag === tag ? '#1f1d1a' : '#888',
                  border: `1px solid ${selectedTag === tag ? '#7bbda4' : '#3a3836'}`,
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontWeight: selectedTag === tag ? 'bold' : 'normal'
                }}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 技能列表 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {filteredSkills.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#666' }}>
            <p>找不到符合條件的技能</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {filteredSkills.map(ws => (
              <div
                key={ws.id}
                style={{
                  padding: '12px',
                  backgroundColor: activeWorkspaceId === ws.id ? '#2d4a2d' : '#2a2826',
                  border: `1px solid ${activeWorkspaceId === ws.id ? '#7bbda4' : '#3a3836'}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
                onClick={() => onOpenSkill(ws.id)}
              >
                {/* 技能標題 */}
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  marginBottom: '6px'
                }}>
                  <div style={{ 
                    fontWeight: 'bold', 
                    fontSize: '14px',
                    color: activeWorkspaceId === ws.id ? '#7bbda4' : '#dfdbc3'
                  }}>
                    {ws.alias || ws.name}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }} onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => {
                        console.log('[SkillLibraryPanel] ▶️ 按鈕被點擊！')
                        console.log('[SkillLibraryPanel] 工作區:', ws.name, ws.id)
                        handleExecuteWorkflow(ws)
                      }}
                      disabled={loadingWorkflowId === ws.id}
                      title={loadingWorkflowId === ws.id ? "載入中..." : "執行工作流程"}
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        backgroundColor: loadingWorkflowId === ws.id ? '#888' : '#7bbda4',
                        color: '#1f1d1a',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: loadingWorkflowId === ws.id ? 'wait' : 'pointer',
                        fontWeight: 'bold',
                        opacity: loadingWorkflowId === ws.id ? 0.6 : 1
                      }}
                    >
                      {loadingWorkflowId === ws.id ? '⏳' : '▶️'}
                    </button>
                    <button
                      onClick={() => onEditSkill(ws.id)}
                      title="編輯配置"
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        backgroundColor: 'transparent',
                        color: '#7bbda4',
                        border: '1px solid #7bbda4',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      ⚙
                    </button>
                    <button
                      onClick={() => handleOpenSkillFolder(ws.folderPath)}
                      title="開啟資料夾"
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        backgroundColor: 'transparent',
                        color: '#888',
                        border: '1px solid #3a3836',
                        borderRadius: '3px',
                        cursor: 'pointer'
                      }}
                    >
                      📁
                    </button>
                  </div>
                </div>

                {/* 技能描述 */}
                {ws.skillConfig?.description && (
                  <div style={{ 
                    fontSize: '12px', 
                    color: '#888',
                    marginBottom: '8px'
                  }}>
                    {ws.skillConfig.description}
                  </div>
                )}

                {/* 標籤 */}
                {ws.skillConfig?.tags && ws.skillConfig.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {ws.skillConfig.tags.map(tag => (
                      <span
                        key={tag}
                        style={{
                          padding: '2px 8px',
                          fontSize: '10px',
                          backgroundColor: '#3a3836',
                          color: '#888',
                          borderRadius: '10px'
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* 快捷操作按鈕 */}
                {ws.skillConfig?.shortcuts && ws.skillConfig.shortcuts.length > 0 && (
                  <div style={{ 
                    display: 'flex', 
                    gap: '6px', 
                    flexWrap: 'wrap',
                    paddingTop: '8px',
                    borderTop: '1px solid #3a3836'
                  }}>
                    {ws.skillConfig.shortcuts.map(shortcut => {
                      // 根據類型生成 tooltip
                      let tooltip = ''
                      switch (shortcut.type) {
                        case 'terminal':
                          tooltip = `終端: ${shortcut.command}`
                          break
                        case 'api':
                          tooltip = `API: ${shortcut.apiMethod} ${shortcut.apiUrl}`
                          break
                        case 'db':
                          tooltip = `資料庫: ${shortcut.dbQuery}`
                          break
                        case 'web':
                          tooltip = `開啟: ${shortcut.webUrl}`
                          break
                        case 'file':
                          tooltip = `文件: ${shortcut.fileAction} ${shortcut.filePath}`
                          break
                        case 'wait':
                          tooltip = `等待: ${shortcut.waitCondition} - ${shortcut.waitTarget}`
                          break
                      }
                      
                      return (
                        <button
                          key={shortcut.id}
                          onClick={async (e) => {
                            e.stopPropagation()
                            
                            // 切換到該工作區
                            onOpenSkill(ws.id)
                            
                            // 等待工作區切換完成後執行動作
                            setTimeout(async () => {
                              try {
                                switch (shortcut.type) {
                                  case 'terminal':
                                    // 在當前工作區的終端執行命令
                                    if (shortcut.command) {
                                      await window.electronAPI.terminal.executeCommand(ws.id, shortcut.command)
                                    }
                                    break
                                    
                                  case 'api':
                                    // 呼叫 API（待實作 IPC handler）
                                    if (shortcut.apiMethod && shortcut.apiUrl) {
                                      await window.electronAPI.skill.executeApiCall({
                                        method: shortcut.apiMethod,
                                        url: shortcut.apiUrl,
                                        headers: shortcut.apiHeaders,
                                        body: shortcut.apiBody
                                      })
                                    }
                                    break
                                    
                                  case 'db':
                                    // 執行資料庫查詢（待實作 IPC handler）
                                    if (shortcut.dbQuery) {
                                      await window.electronAPI.skill.executeDbQuery({
                                        connection: shortcut.dbConnection,
                                        query: shortcut.dbQuery
                                      })
                                    }
                                    break
                                    
                                  case 'web':
                                    // 在 WebView 面板開啟網頁
                                    if (shortcut.webUrl) {
                                      await window.electronAPI.skill.openWebUrl(shortcut.webUrl)
                                    }
                                    break
                                    
                                  case 'file':
                                    // 文件操作（待實作 IPC handler）
                                    if (shortcut.fileAction && shortcut.filePath) {
                                      await window.electronAPI.skill.executeFileAction({
                                        action: shortcut.fileAction,
                                        path: shortcut.filePath
                                      })
                                    }
                                    break
                                    
                                  case 'wait':
                                    // 等待條件（待實作 IPC handler）
                                    if (shortcut.waitCondition && shortcut.waitTarget) {
                                      await window.electronAPI.skill.waitForCondition({
                                        condition: shortcut.waitCondition,
                                        target: shortcut.waitTarget,
                                        timeout: shortcut.waitTimeout || 300
                                      })
                                    }
                                    break
                                }
                              } catch (error) {
                                console.error('執行快捷操作失敗:', error)
                                alert(`執行失敗: ${error}`)
                              }
                            }, 100)
                          }}
                          title={tooltip}
                          style={{
                            padding: '4px 10px',
                            fontSize: '11px',
                            backgroundColor: '#4a9eff',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <span>{shortcut.icon}</span>
                          <span>{shortcut.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* 工作區路徑 */}
                <div style={{ 
                  fontSize: '10px', 
                  color: '#666',
                  marginTop: '6px',
                  fontFamily: 'monospace'
                }}>
                  {ws.folderPath}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div style={{ 
        padding: '12px', 
        borderTop: '1px solid var(--border-color)',
        fontSize: '11px',
        color: '#666',
        backgroundColor: 'var(--bg-secondary)'
      }}>
        💡 ▶️ 執行工作流程 | ⚙ 配置技能 | 📁 開啟資料夾
      </div>
    </div>
  )
}
