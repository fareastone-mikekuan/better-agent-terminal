/**
 * 技能執行面板
 * 顯示當前工作區可用的技能，並允許用戶選擇執行
 */
import { useState, useEffect } from 'react'
import { workspaceStore } from '../stores/workspace-store'
import { parseWorkflowFromMarkdown } from '../utils/workflow-parser'
import type { Workspace } from '../types'

interface SkillPanelProps {
  isVisible: boolean
  onClose: () => void
  width?: number
  workspaceId?: string | null
  collapsed?: boolean
  onCollapse?: () => void
  onExecuteWorkflow?: (workspace: Workspace, content: string) => void
}

export function SkillPanel({
  isVisible,
  onClose,
  width = 320,
  workspaceId,
  collapsed = false,
  onCollapse,
  onExecuteWorkflow
}: Readonly<SkillPanelProps>) {
  const [skills, setSkills] = useState<Workspace[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [allTags, setAllTags] = useState<string[]>([])
  const [loadingSkillId, setLoadingSkillId] = useState<string | null>(null)

  // 載入技能列表
  useEffect(() => {
    const loadSkills = () => {
      const allWorkspaces = workspaceStore.getState().workspaces
      const skillWorkspaces = allWorkspaces.filter(ws => ws.skillConfig?.isSkill)
      setSkills(skillWorkspaces)

      // 收集所有標籤
      const tags = Array.from(
        new Set(skillWorkspaces.flatMap(ws => ws.skillConfig?.tags || []))
      ).sort()
      setAllTags(tags)
    }

    loadSkills()

    // 訂閱工作區變更
    const unsubscribe = workspaceStore.subscribe(loadSkills)
    return unsubscribe
  }, [])

  // 篩選技能
  const filteredSkills = skills.filter(ws => {
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

  // 執行技能
  const handleExecuteSkill = async (skill: Workspace) => {
    if (!workspaceId) {
      alert('請先選擇一個工作區')
      return
    }

    setLoadingSkillId(skill.id)
    try {
      // 讀取 skill.md
      const skillMdPath = `${skill.folderPath}/skill.md`
      const result = await window.electronAPI.fs.readFile(skillMdPath, skill.folderPath)

      if (result.success && result.content) {
        // 解析工作流程
        const steps = parseWorkflowFromMarkdown(result.content)
        
        if (steps.length === 0) {
          alert('此技能沒有定義工作流程')
          return
        }

        // 傳遞給父組件執行
        if (onExecuteWorkflow) {
          onExecuteWorkflow(skill, result.content)
        }
      } else {
        alert('無法讀取技能檔案')
      }
    } catch (error) {
      console.error('執行技能失敗:', error)
      alert('執行技能失敗')
    } finally {
      setLoadingSkillId(null)
    }
  }

  // 查看技能詳情
  const handleViewSkill = async (skill: Workspace) => {
    const skillMdPath = `${skill.folderPath}/skill.md`
    await window.electronAPI.shell.openExternal(skillMdPath)
  }

  if (!isVisible) return null

  return (
    <div
      className="skill-panel"
      style={{
        width: collapsed ? '32px' : `${width}px`,
        height: '100%',
        backgroundColor: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.2s'
      }}
    >
      {collapsed ? (
        // 收合狀態
        <div
          style={{
            width: '32px',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '8px 0',
            gap: '8px'
          }}
        >
          <button
            onClick={onCollapse}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '4px',
              transform: 'rotate(180deg)'
            }}
            title="展開技能面板"
          >
            ◀
          </button>
          <div
            style={{
              writingMode: 'vertical-rl',
              color: 'var(--text-secondary)',
              fontSize: '12px',
              userSelect: 'none'
            }}
          >
            🎯 技能
          </div>
        </div>
      ) : (
        // 展開狀態
        <>
          {/* 標題列 */}
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'var(--bg-primary)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>🎯</span>
              <span style={{ fontWeight: 600, fontSize: '14px' }}>技能</span>
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={onCollapse}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '4px 8px'
                }}
                title="收合"
              >
                ▶
              </button>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '18px',
                  padding: '4px 8px'
                }}
                title="關閉"
              >
                ×
              </button>
            </div>
          </div>

          {/* 當前工作區提示 */}
          {workspaceId && (
            <div
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--bg-tertiary)',
                borderBottom: '1px solid var(--border-color)',
                fontSize: '12px',
                color: 'var(--text-secondary)'
              }}
            >
              工作區: {workspaceStore.getState().workspaces.find(w => w.id === workspaceId)?.alias || 
                       workspaceStore.getState().workspaces.find(w => w.id === workspaceId)?.name || '未知'}
            </div>
          )}

          {/* 搜尋和篩選 */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
            <input
              type="text"
              placeholder="搜尋技能..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 8px',
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                color: 'var(--text-primary)',
                fontSize: '12px',
                outline: 'none'
              }}
            />

            {/* 標籤篩選 */}
            {allTags.length > 0 && (
              <div style={{ marginTop: '8px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                <button
                  onClick={() => setSelectedTag(null)}
                  style={{
                    padding: '2px 8px',
                    fontSize: '11px',
                    backgroundColor: selectedTag === null ? 'var(--accent-color)' : 'var(--bg-tertiary)',
                    color: selectedTag === null ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    cursor: 'pointer'
                  }}
                >
                  全部
                </button>
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(tag)}
                    style={{
                      padding: '2px 8px',
                      fontSize: '11px',
                      backgroundColor: selectedTag === tag ? 'var(--accent-color)' : 'var(--bg-tertiary)',
                      color: selectedTag === tag ? '#fff' : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 技能列表 */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
            {!workspaceId ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px'
                }}
              >
                請先選擇一個工作區來使用技能
              </div>
            ) : filteredSkills.length === 0 ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-secondary)',
                  fontSize: '13px'
                }}
              >
                {searchQuery || selectedTag ? '沒有符合條件的技能' : '沒有可用的技能'}
              </div>
            ) : (
              filteredSkills.map(skill => (
                <div
                  key={skill.id}
                  style={{
                    marginBottom: '8px',
                    padding: '12px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      marginBottom: '8px'
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '13px',
                          color: 'var(--text-primary)',
                          marginBottom: '4px'
                        }}
                      >
                        {skill.alias || skill.name}
                      </div>
                      {skill.skillConfig?.description && (
                        <div
                          style={{
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                            lineHeight: '1.4',
                            marginBottom: '8px'
                          }}
                        >
                          {skill.skillConfig.description}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 標籤 */}
                  {skill.skillConfig?.tags && skill.skillConfig.tags.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                      {skill.skillConfig.tags.map(tag => (
                        <span
                          key={tag}
                          style={{
                            padding: '2px 6px',
                            fontSize: '10px',
                            backgroundColor: 'var(--bg-tertiary)',
                            color: 'var(--text-secondary)',
                            borderRadius: '8px'
                          }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* 操作按鈕 */}
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => handleExecuteSkill(skill)}
                      disabled={loadingSkillId === skill.id}
                      style={{
                        flex: 1,
                        padding: '6px 12px',
                        fontSize: '12px',
                        backgroundColor: 'var(--accent-color)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: loadingSkillId === skill.id ? 'not-allowed' : 'pointer',
                        opacity: loadingSkillId === skill.id ? 0.6 : 1
                      }}
                    >
                      {loadingSkillId === skill.id ? '執行中...' : '▶ 執行'}
                    </button>
                    <button
                      onClick={() => handleViewSkill(skill)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-primary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        cursor: 'pointer'
                      }}
                    >
                      📄
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
