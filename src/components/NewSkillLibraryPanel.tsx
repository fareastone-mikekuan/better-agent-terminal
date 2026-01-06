/**
 * 新版技能庫面板 - 集中管理所有技能
 */
import { useState, useEffect, useRef } from 'react'
import { skillStore } from '../stores/skill-store'
import { DEFAULT_CATEGORIES, SKILL_TEMPLATES, isAIAgentSkill } from '../types/skill'
import type { UnifiedSkill, SkillStep, Skill } from '../types/skill'

interface NewSkillLibraryPanelProps {
  onClose: () => void
}

export function NewSkillLibraryPanel({ onClose }: NewSkillLibraryPanelProps) {
  const [skills, setSkills] = useState<UnifiedSkill[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'templates'>('list')
  const [editingSkill, setEditingSkill] = useState<UnifiedSkill | null>(null)
  const [showAIAgentCreator, setShowAIAgentCreator] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const initializeSkills = async () => {
      await skillStore.ensureLoaded()
      loadSkills()
    }
    initializeSkills()
    const unsubscribe = skillStore.subscribe(loadSkills)
    return unsubscribe
  }, [])

  const loadSkills = () => {
    const allSkills = skillStore.getSkills()
    console.log('[SkillLibrary] loadSkills 被調用，獲取到', allSkills.length, '個技能')
    console.log('[SkillLibrary] 技能列表:', allSkills.map(s => s.name))
    setSkills(allSkills)
  }

  const filteredSkills = skills.filter(skill => {
    if (selectedCategory && skill.category !== selectedCategory) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        skill.name.toLowerCase().includes(q) ||
        skill.description.toLowerCase().includes(q) ||
        skill.tags.some(tag => tag.toLowerCase().includes(q))
      )
    }
    return true
  })

  const handleAddFromTemplate = (templateId: string) => {
    const template = SKILL_TEMPLATES.find(t => t.id === templateId)
    if (!template) return
    
    // 直接使用模板創建技能，然後打開編輯器讓用戶修改
    const newSkill = skillStore.addSkillFromTemplate(templateId)
    if (newSkill) {
      setEditingSkill(newSkill)
      setViewMode('list')
    }
  }

  const handleCreateNew = () => {
    const newSkill: Omit<Skill, 'id' | 'createdAt' | 'updatedAt'> = {
      name: '新技能',
      description: '',
      category: 'other',
      tags: [],
      steps: []
    }
    const created = skillStore.addSkill(newSkill)
    setEditingSkill(created)
  }

  const handleImport = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      
      if (Array.isArray(data)) {
        const count = skillStore.importSkills(data)
        console.log('[SkillLibrary] 匯入了', count, '個技能')
        loadSkills() // 強制刷新技能列表
        alert(`成功匯入 ${count} 個技能`)
      } else {
        skillStore.importSkill(data)
        console.log('[SkillLibrary] 匯入了 1 個技能')
        loadSkills() // 強制刷新技能列表
        alert('成功匯入技能')
      }
    } catch (error) {
      console.error('[SkillLibrary] 匯入失敗:', error)
      alert('匯入失敗：' + error)
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleExport = (skill: UnifiedSkill) => {
    const data = JSON.stringify(skill, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${skill.name}.skill.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportAll = () => {
    const data = JSON.stringify(skills, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `all-skills-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDelete = (skill: UnifiedSkill) => {
    if (confirm(`確定要刪除技能「${skill.name}」嗎？`)) {
      skillStore.deleteSkill(skill.id)
    }
  }

  const handleDuplicate = (skill: UnifiedSkill) => {
    skillStore.duplicateSkill(skill.id)
  }

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}
        onClick={onClose}
      >
        <div
          style={{
            width: '900px',
            maxWidth: '90vw',
            height: '85vh',
            backgroundColor: 'var(--bg-primary)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* 標題列 */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'var(--bg-secondary)'
            }}
          >
            <h2 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📚 技能庫
              <span style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 'normal' }}>
                ({filteredSkills.length} 個技能)
              </span>
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setViewMode(viewMode === 'list' ? 'templates' : 'list')}
                style={{
                  padding: '6px 12px',
                  fontSize: '13px',
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {viewMode === 'list' ? '📝 模板' : '📋 列表'}
              </button>
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '4px 8px'
                }}
              >
                ×
              </button>
            </div>
          </div>

          {viewMode === 'list' ? (
            <>
              {/* 工具列 */}
              <div
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border-color)',
                  display: 'flex',
                  gap: '8px',
                  flexWrap: 'wrap'
                }}
              >
                <button
                  onClick={handleCreateNew}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    backgroundColor: '#7bbda4',
                    color: '#1f1d1a',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  ➕ 新增自動化技能
                </button>
                <button
                  onClick={() => setShowAIAgentCreator(true)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    backgroundColor: '#ec4899',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  🤖 新增 AI Agent
                </button>
                <button
                  onClick={handleImport}
                  style={{
                    padding: '8px 16px',
                    fontSize: '13px',
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  📥 匯入 JSON
                </button>
                {skills.length > 0 && (
                  <button
                    onClick={handleExportAll}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    📤 匯出全部
                  </button>
                )}
              </div>

              {/* 搜尋和篩選 */}
              <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)' }}>
                <input
                  type="text"
                  placeholder="搜尋技能..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none',
                    marginBottom: '8px'
                  }}
                />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => setSelectedCategory(null)}
                    style={{
                      padding: '4px 12px',
                      fontSize: '12px',
                      backgroundColor: selectedCategory === null ? '#7bbda4' : 'var(--bg-tertiary)',
                      color: selectedCategory === null ? '#1f1d1a' : 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    全部
                  </button>
                  {DEFAULT_CATEGORIES.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      style={{
                        padding: '4px 12px',
                        fontSize: '12px',
                        backgroundColor: selectedCategory === cat.id ? cat.color : 'var(--bg-tertiary)',
                        color: selectedCategory === cat.id ? '#fff' : 'var(--text-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      {cat.icon} {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* 技能列表 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {filteredSkills.length === 0 ? (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '60px 20px',
                      color: 'var(--text-secondary)'
                    }}
                  >
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📚</div>
                    <p>尚無技能</p>
                    <p style={{ fontSize: '13px' }}>點擊「➕ 新增技能」或「📝 模板」開始</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                    {filteredSkills.map(skill => {
                      const category = DEFAULT_CATEGORIES.find(c => c.id === skill.category)
                      return (
                        <div
                          key={skill.id}
                          style={{
                            padding: '16px',
                            backgroundColor: 'var(--bg-secondary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            cursor: isAIAgentSkill(skill) ? 'default' : 'pointer'
                          }}
                          onClick={() => {
                            if (!isAIAgentSkill(skill)) {
                              setEditingSkill(skill)
                            }
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '24px' }}>{skill.icon || category?.icon || '📦'}</span>
                              <div>
                                <div style={{ fontWeight: 'bold', fontSize: '14px', color: 'var(--text-primary)' }}>
                                  {skill.name}
                                </div>
                                {category && (
                                  <div style={{ fontSize: '11px', color: category.color }}>
                                    {category.name}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          {skill.description && (
                            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.4' }}>
                              {skill.description}
                            </div>
                          )}
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                            {isAIAgentSkill(skill) ? 'AI Agent' : `${skill.steps.length} 個步驟`}
                          </div>
                          {skill.tags.length > 0 && (
                            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                              {skill.tags.map(tag => (
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
                          <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }} onClick={e => e.stopPropagation()}>
                            <button
                              onClick={() => handleDuplicate(skill)}
                              style={{
                                flex: 1,
                                padding: '6px',
                                fontSize: '11px',
                                backgroundColor: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              📋 複製
                            </button>
                            <button
                              onClick={() => handleExport(skill)}
                              style={{
                                flex: 1,
                                padding: '6px',
                                fontSize: '11px',
                                backgroundColor: 'var(--bg-tertiary)',
                                color: 'var(--text-primary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              📤 匯出
                            </button>
                            <button
                              onClick={() => handleDelete(skill)}
                              style={{
                                padding: '6px 10px',
                                fontSize: '11px',
                                backgroundColor: '#cb6077',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                              }}
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* 模板視圖 */
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              <h3 style={{ marginBottom: '16px' }}>選擇模板</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                {SKILL_TEMPLATES.map(template => {
                  const category = DEFAULT_CATEGORIES.find(c => c.id === template.category)
                  return (
                    <div
                      key={template.id}
                      style={{
                        padding: '16px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '24px' }}>{template.icon}</span>
                        <div>
                          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{template.name}</div>
                          {category && (
                            <div style={{ fontSize: '11px', color: category.color }}>{category.name}</div>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        {template.description}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                        {template.steps.length} 個步驟
                      </div>
                      <button
                        onClick={() => handleAddFromTemplate(template.id)}
                        style={{
                          width: '100%',
                          padding: '8px',
                          fontSize: '13px',
                          backgroundColor: '#7bbda4',
                          color: '#1f1d1a',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        ➕ 使用此模板
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 隱藏的文件輸入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.skill.json"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* 編輯對話框 - 只支持自動化技能 */}
      {editingSkill && !isAIAgentSkill(editingSkill) && (
        <SkillEditorDialog
          skill={editingSkill as Skill}
          onSave={(updated) => {
            skillStore.updateSkill(updated.id, updated)
            setEditingSkill(null)
          }}
          onClose={() => setEditingSkill(null)}
        />
      )}

      {/* AI Agent 技能暫不支持編輯 */}
      {editingSkill && isAIAgentSkill(editingSkill) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} onClick={() => setEditingSkill(null)}>
          <div style={{
            backgroundColor: 'var(--bg-primary)',
            padding: '24px',
            borderRadius: '8px',
            maxWidth: '400px',
            textAlign: 'center'
          }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🤖</div>
            <h3 style={{ marginBottom: '8px' }}>AI Agent 技能</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>
              AI Agent 技能暫不支持在此編輯，請從 SKILL.md 文件導入或使用專用編輯器。
            </p>
            <button onClick={() => setEditingSkill(null)} style={{
              padding: '8px 16px',
              backgroundColor: '#7bbda4',
              color: '#1f1d1a',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}>
              確定
            </button>
          </div>
        </div>
      )}

      {/* AI Agent 創建器 */}
      {showAIAgentCreator && (
        <AIAgentCreator
          onSave={(agent) => {
            skillStore.addSkill(agent)
            setShowAIAgentCreator(false)
          }}
          onClose={() => setShowAIAgentCreator(false)}
        />
      )}
    </>
  )
}

// 技能編輯對話框
interface SkillEditorDialogProps {
  skill: Skill
  onSave: (skill: Skill) => void
  onClose: () => void
}

function SkillEditorDialog({ skill, onSave, onClose }: SkillEditorDialogProps) {
  const [editedSkill, setEditedSkill] = useState<Skill>(skill)
  const [activeTab, setActiveTab] = useState<'info' | 'steps'>('info')

  const handleSave = () => {
    onSave(editedSkill)
  }

  const addStep = () => {
    const newStep: SkillStep = {
      id: `step-${Date.now()}`,
      type: 'terminal',
      name: '新步驟',
      config: {}
    }
    setEditedSkill({
      ...editedSkill,
      steps: [...editedSkill.steps, newStep]
    })
  }

  const updateStep = (index: number, updates: Partial<SkillStep>) => {
    const newSteps = [...editedSkill.steps]
    newSteps[index] = { ...newSteps[index], ...updates }
    setEditedSkill({ ...editedSkill, steps: newSteps })
  }

  const deleteStep = (index: number) => {
    const newSteps = editedSkill.steps.filter((_, i) => i !== index)
    setEditedSkill({ ...editedSkill, steps: newSteps })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        zIndex: 1001,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '700px',
          maxWidth: '90vw',
          maxHeight: '80vh',
          backgroundColor: 'var(--bg-primary)',
          borderRadius: '8px',
          border: '1px solid var(--border-color)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 標題 */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <h3 style={{ margin: 0 }}>編輯技能</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: '24px',
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>

        {/* 分頁 */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
          <button
            onClick={() => setActiveTab('info')}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: activeTab === 'info' ? 'var(--bg-primary)' : 'var(--bg-secondary)',
              color: activeTab === 'info' ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: 'none',
              borderBottom: activeTab === 'info' ? '2px solid #7bbda4' : 'none',
              cursor: 'pointer'
            }}
          >
            基本資訊
          </button>
          <button
            onClick={() => setActiveTab('steps')}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: activeTab === 'steps' ? 'var(--bg-primary)' : 'var(--bg-secondary)',
              color: activeTab === 'steps' ? 'var(--text-primary)' : 'var(--text-secondary)',
              border: 'none',
              borderBottom: activeTab === 'steps' ? '2px solid #7bbda4' : 'none',
              cursor: 'pointer'
            }}
          >
            執行步驟 ({editedSkill.steps.length})
          </button>
        </div>

        {/* 內容 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {activeTab === 'info' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>名稱</label>
                <input
                  type="text"
                  value={editedSkill.name}
                  onChange={e => setEditedSkill({ ...editedSkill, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>描述</label>
                <textarea
                  value={editedSkill.description}
                  onChange={e => setEditedSkill({ ...editedSkill, description: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    resize: 'vertical'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>類別</label>
                <select
                  value={editedSkill.category}
                  onChange={e => setEditedSkill({ ...editedSkill, category: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                >
                  {DEFAULT_CATEGORIES.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>圖示</label>
                <input
                  type="text"
                  value={editedSkill.icon || ''}
                  onChange={e => setEditedSkill({ ...editedSkill, icon: e.target.value })}
                  placeholder="輸入 Emoji，例如：🚀"
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px' }}>標籤 (用逗號分隔)</label>
                <input
                  type="text"
                  value={editedSkill.tags.join(', ')}
                  onChange={e => setEditedSkill({ ...editedSkill, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                  placeholder="例如：git, deployment, ci/cd"
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    color: 'var(--text-primary)',
                    fontSize: '13px'
                  }}
                />
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0 }}>執行步驟</h4>
                <button
                  onClick={addStep}
                  style={{
                    padding: '6px 12px',
                    fontSize: '13px',
                    backgroundColor: '#7bbda4',
                    color: '#1f1d1a',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  ➕ 新增步驟
                </button>
              </div>
              {editedSkill.steps.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                  尚無步驟，點擊「新增步驟」開始
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {editedSkill.steps.map((step, index) => (
                    <div
                      key={step.id}
                      style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--text-secondary)' }}>{index + 1}.</span>
                        <div style={{ flex: 1 }}>
                          <input
                            type="text"
                            value={step.name}
                            onChange={e => updateStep(index, { name: e.target.value })}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              backgroundColor: 'var(--bg-tertiary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                              fontSize: '13px',
                              marginBottom: '8px'
                            }}
                          />
                          <select
                            value={step.type}
                            onChange={e => updateStep(index, { type: e.target.value as any })}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              backgroundColor: 'var(--bg-tertiary)',
                              border: '1px solid var(--border-color)',
                              borderRadius: '4px',
                              color: 'var(--text-primary)',
                              fontSize: '13px',
                              marginBottom: '8px'
                            }}
                          >
                            <option value="terminal">終端機</option>
                            <option value="api">API 測試</option>
                            <option value="db">資料庫</option>
                            <option value="web">網頁</option>
                            <option value="file">檔案</option>
                          </select>
                          {step.type === 'terminal' && (
                            <textarea
                              value={step.config.command || ''}
                              onChange={e => updateStep(index, { config: { ...step.config, command: e.target.value } })}
                              placeholder="輸入命令，例如：npm install"
                              rows={2}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                backgroundColor: 'var(--bg-tertiary)',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                color: 'var(--text-primary)',
                                fontSize: '12px',
                                fontFamily: 'monospace',
                                resize: 'vertical'
                              }}
                            />
                          )}
                          {step.type === 'api' && (
                            <>
                              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                <select
                                  value={step.config.method || 'GET'}
                                  onChange={e => updateStep(index, { config: { ...step.config, method: e.target.value as any } })}
                                  style={{
                                    padding: '6px 8px',
                                    backgroundColor: 'var(--bg-tertiary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '4px',
                                    color: 'var(--text-primary)',
                                    fontSize: '12px'
                                  }}
                                >
                                  <option value="GET">GET</option>
                                  <option value="POST">POST</option>
                                  <option value="PUT">PUT</option>
                                  <option value="DELETE">DELETE</option>
                                  <option value="PATCH">PATCH</option>
                                </select>
                                <input
                                  type="text"
                                  value={step.config.url || ''}
                                  onChange={e => updateStep(index, { config: { ...step.config, url: e.target.value } })}
                                  placeholder="URL"
                                  style={{
                                    flex: 1,
                                    padding: '6px 8px',
                                    backgroundColor: 'var(--bg-tertiary)',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '4px',
                                    color: 'var(--text-primary)',
                                    fontSize: '12px'
                                  }}
                                />
                              </div>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => deleteStep(index)}
                          style={{
                            padding: '4px 8px',
                            backgroundColor: '#cb6077',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                          }}
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按鈕 */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            gap: '8px',
            justifyContent: 'flex-end'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
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
    </div>
  )
}

// AI Agent 創建對話框
interface AIAgentCreatorProps {
  onSave: (agent: Omit<import('../types/skill').AIAgentSkill, 'id' | 'createdAt' | 'updatedAt'>) => void
  onClose: () => void
}

function AIAgentCreator({ onSave, onClose }: AIAgentCreatorProps) {
  const [jsonMode, setJsonMode] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'ai-agent',
    tags: [] as string[],
    icon: '🤖',
    role: '',
    expertise: [] as string[],
    instructions: '',
    constraints: [] as string[],
    terminal: true,
    fileSystem: true,
    database: false,
    api: true,
    knowledgeBase: true,
    maxIterations: 10,
    timeout: 300000,
    requireApproval: true
  })

  const handleSubmit = () => {
    if (jsonMode) {
      // JSON 模式
      try {
        const parsed = JSON.parse(jsonInput)
        onSave(parsed)
      } catch (error) {
        alert('JSON 格式錯誤: ' + error)
        return
      }
    } else {
      // 表單模式
      if (!formData.name || !formData.role || !formData.instructions) {
        alert('請填寫名稱、角色和指令')
        return
      }

      const agent: Omit<import('../types/skill').AIAgentSkill, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'ai-agent',
        name: formData.name,
        description: formData.description,
        category: formData.category,
        tags: formData.tags,
        icon: formData.icon,
        prompt: {
          role: formData.role,
          expertise: formData.expertise,
          instructions: formData.instructions,
          constraints: formData.constraints
        },
        allowedTools: {
          terminal: formData.terminal,
          fileSystem: formData.fileSystem,
          database: formData.database,
          api: formData.api,
          knowledgeBase: formData.knowledgeBase
        },
        knowledgeBaseIds: [],
        triggers: {
          manual: true,
          errorPatterns: [],
          logPatterns: [],
          events: []
        },
        config: {
          maxIterations: formData.maxIterations,
          timeout: formData.timeout,
          requireApproval: formData.requireApproval
        }
      }
      
      onSave(agent)
    }
  }

  const sampleJSON = `{
  "type": "ai-agent",
  "name": "DevOps 工程師",
  "description": "診斷系統問題並提供解決方案",
  "category": "ai-agent",
  "tags": ["devops", "診斷", "監控"],
  "icon": "🤖",
  "prompt": {
    "role": "你是一個資深 DevOps 工程師",
    "expertise": ["Docker", "Kubernetes", "監控", "日誌分析"],
    "instructions": "當系統出現問題時，分析日誌並提供解決方案",
    "constraints": ["不要執行危險命令", "總是詢問用戶確認"]
  },
  "allowedTools": {
    "terminal": true,
    "fileSystem": true,
    "database": false,
    "api": true,
    "knowledgeBase": true
  },
  "knowledgeBaseIds": [],
  "triggers": {
    "manual": true,
    "errorPatterns": [],
    "logPatterns": [],
    "events": []
  },
  "config": {
    "maxIterations": 10,
    "timeout": 300000,
    "requireApproval": true
  }
}`

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-primary)',
          borderRadius: '8px',
          width: '90%',
          maxWidth: '800px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>🤖</span>
            <h2 style={{ margin: 0, fontSize: '18px' }}>創建 AI Agent 技能</h2>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setJsonMode(!jsonMode)}
              style={{
                padding: '6px 12px',
                fontSize: '12px',
                backgroundColor: jsonMode ? '#ec4899' : 'var(--bg-tertiary)',
                color: jsonMode ? 'white' : 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              {jsonMode ? '📝 表單模式' : '🔧 JSON 模式'}
            </button>
            <button onClick={onClose} style={{
              padding: '4px 8px',
              fontSize: '18px',
              backgroundColor: 'transparent',
              color: 'var(--text-secondary)',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}>
              ×
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {jsonMode ? (
            /* JSON 編輯模式 */
            <div>
              <div style={{ marginBottom: '12px' }}>
                <button
                  onClick={() => setJsonInput(sampleJSON)}
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
                  📋 載入範例
                </button>
              </div>
              <textarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder="貼上 AI Agent JSON 配置..."
                style={{
                  width: '100%',
                  height: '500px',
                  padding: '12px',
                  fontSize: '13px',
                  fontFamily: 'Consolas, Monaco, monospace',
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '4px',
                  resize: 'vertical'
                }}
              />
            </div>
          ) : (
            /* 表單編輯模式 */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
                  名稱 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例如：DevOps 工程師"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
                  描述
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="簡短描述此 Agent 的功能"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
                  角色定義 *
                </label>
                <textarea
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  placeholder="例如：你是一個資深 DevOps 工程師，擅長系統診斷和問題排查"
                  style={{
                    width: '100%',
                    height: '80px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
                  專業領域（用逗號分隔）
                </label>
                <input
                  type="text"
                  value={formData.expertise.join(', ')}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    expertise: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  })}
                  placeholder="例如：Docker, Kubernetes, 監控, 日誌分析"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
                  執行指令 *
                </label>
                <textarea
                  value={formData.instructions}
                  onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                  placeholder="描述 Agent 應該如何執行任務，例如：當系統出現問題時，分析日誌並提供解決方案"
                  style={{
                    width: '100%',
                    height: '100px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
                  限制條件（用逗號分隔）
                </label>
                <input
                  type="text"
                  value={formData.constraints.join(', ')}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    constraints: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                  })}
                  placeholder="例如：不要執行危險命令, 總是詢問用戶確認"
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontSize: '13px',
                    backgroundColor: 'var(--bg-secondary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600 }}>
                  允許的工具
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { key: 'terminal', label: '終端命令', icon: '💻' },
                    { key: 'fileSystem', label: '文件系統', icon: '📁' },
                    { key: 'database', label: '資料庫', icon: '🗄️' },
                    { key: 'api', label: 'API 呼叫', icon: '🔌' },
                    { key: 'knowledgeBase', label: '知識庫', icon: '📚' }
                  ].map(tool => (
                    <label key={tool.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formData[tool.key as keyof typeof formData] as boolean}
                        onChange={(e) => setFormData({ ...formData, [tool.key]: e.target.checked })}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '16px' }}>{tool.icon}</span>
                      <span style={{ fontSize: '13px' }}>{tool.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', fontWeight: 600 }}>
                    最大迭代次數
                  </label>
                  <input
                    type="number"
                    value={formData.maxIterations}
                    onChange={(e) => setFormData({ ...formData, maxIterations: parseInt(e.target.value) || 10 })}
                    min="1"
                    max="50"
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '13px',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '4px'
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '28px' }}>
                    <input
                      type="checkbox"
                      checked={formData.requireApproval}
                      onChange={(e) => setFormData({ ...formData, requireApproval: e.target.checked })}
                      style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>需要批准危險操作</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border-color)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px'
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              backgroundColor: '#ec4899',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            創建 AI Agent
          </button>
        </div>
      </div>
    </div>
  )
}
