/**
 * 知識庫管理面板
 */
import { useState, useEffect, useRef } from 'react'
import { knowledgeStore } from '../stores/knowledge-store'
import { settingsStore } from '../stores/settings-store'
import type { KnowledgeEntry } from '../types/knowledge-base'
import { formatFileSize } from '../types/knowledge-base'
import * as XLSX from 'xlsx'

interface KnowledgeBasePanelProps {
  onClose: () => void
}

export function KnowledgeBasePanel({ onClose }: KnowledgeBasePanelProps) {
  const [entries, setEntries] = useState(knowledgeStore.getEntries())
  const [categories, setCategories] = useState(knowledgeStore.getCategories())
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [isLearning, setIsLearning] = useState(false)
  const [learningStatus, setLearningStatus] = useState<string>('')
  const [selectedEntry, setSelectedEntry] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const unsubscribe = knowledgeStore.subscribe(() => {
      setEntries(knowledgeStore.getEntries())
      setCategories(knowledgeStore.getCategories())
    })
    
    // 調試：檢查知識庫狀態
    console.log('[KnowledgeBase] Current state:', {
      totalEntries: knowledgeStore.getEntries().length,
      learnedEntries: knowledgeStore.getEntries().filter(e => e.isLearned).length,
      activeKnowledge: knowledgeStore.getActiveKnowledge().length,
      categories: knowledgeStore.getCategories().map(c => ({ id: c.id, enabled: c.enabled })),
      entries: knowledgeStore.getEntries().map(e => ({
        name: e.name,
        isLearned: e.isLearned,
        category: e.category,
        size: e.content.length
      }))
    })
    
    return unsubscribe
  }, [])

  // 學習知識（使用 Copilot API 驗證）
  const learnKnowledge = async (entry: KnowledgeEntry) => {
    setIsLearning(true)
    setLearningStatus(`正在學習「${entry.name}」...`)

    try {
      // 檢查 Copilot 是否已啟用
      const isEnabled = await settingsStore.isCopilotEnabled()
      if (!isEnabled) {
        throw new Error('請先在設定中配置 GitHub Copilot')
      }

      // 簡化驗證：只確認 API 可用，內容已保存即可
      // 實際學習會在 CHAT 使用時動態加載完整內容
      const testPrompt = `測試連線，請回覆 OK`

      const response = await window.electronAPI.copilot.chat(`learn-${entry.id}`, {
        messages: [
          { role: 'user', content: testPrompt }
        ]
      })

      if (response.error) {
        throw new Error(response.error)
      }

      // 成功學習（標記為已學習，完整內容已保存在 store 中）
      knowledgeStore.markAsLearned(entry.id)
      const sizeKB = (entry.content.length / 1024).toFixed(1)
      setLearningStatus(`✅ 已成功學習「${entry.name}」 (${sizeKB} KB)\n內容已保存，在對話中會自動提供給 AI 參考`)
      
      // 3秒後清除狀態
      setTimeout(() => {
        setLearningStatus('')
      }, 3000)

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setLearningStatus(`❌ 學習失敗：${errorMsg}`)
      setTimeout(() => {
        setLearningStatus('')
      }, 5000)
    } finally {
      setIsLearning(false)
    }
  }

  // 處理文件上傳
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    for (const file of Array.from(files)) {
      try {
        let content = ''
        const fileName = file.name
        const fileExt = fileName.toLowerCase().split('.').pop()

        // 處理 Excel 文件
        if (fileExt === 'xlsx' || fileExt === 'xls') {
          const arrayBuffer = await file.arrayBuffer()
          const workbook = XLSX.read(arrayBuffer, { type: 'array' })
          
          // 將所有工作表轉換為文本（限制行數避免過大）
          const sheets: string[] = []
          const MAX_ROWS_PER_SHEET = 500 // 每個工作表最多讀取 500 行
          
          workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName]
            
            // 獲取工作表範圍
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1')
            const totalRows = range.e.r + 1
            
            // 如果超過限制，只讀取前 N 行
            if (totalRows > MAX_ROWS_PER_SHEET) {
              const limitedRange = XLSX.utils.encode_range({
                s: { r: 0, c: range.s.c },
                e: { r: MAX_ROWS_PER_SHEET - 1, c: range.e.c }
              })
              worksheet['!ref'] = limitedRange
              sheets.push(
                `【工作表: ${sheetName}】 (僅讀取前 ${MAX_ROWS_PER_SHEET}/${totalRows} 行)\n${XLSX.utils.sheet_to_csv(worksheet)}`
              )
            } else {
              sheets.push(
                `【工作表: ${sheetName}】 (共 ${totalRows} 行)\n${XLSX.utils.sheet_to_csv(worksheet)}`
              )
            }
          })
          
          content = sheets.join('\n\n')
          
          if (!content.trim()) {
            setLearningStatus(`⚠️ Excel 文件「${fileName}」內容為空`)
            continue
          }
        } else {
          // 處理文本文件
          content = await file.text()
        }
        
        // 檢查內容大小
        const contentSizeKB = content.length / 1024
        if (contentSizeKB > 500) {
          setLearningStatus(`⚠️ 文件「${fileName}」太大 (${contentSizeKB.toFixed(1)} KB)，建議拆分成多個較小的文件`)
          continue
        }
        
        const category = selectedCategory === 'all' ? 'custom' : selectedCategory as KnowledgeEntry['category']
        
        const entry = await knowledgeStore.addEntry(fileName, content, category)
        
        // 自動學習
        await learnKnowledge(entry)
        
      } catch (error) {
        console.error('Failed to upload file:', error)
        setLearningStatus(`❌ 上傳失敗：${file.name} - ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // 清空 input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 驗證已學習
  const verifyLearned = async (entry: KnowledgeEntry) => {
    if (!entry.isLearned) {
      setLearningStatus('⚠️ 此知識尚未學習')
      return
    }

    setIsLearning(true)
    setLearningStatus('正在驗證...')

    try {
      // 構建包含知識庫內容的 system prompt
      const systemPrompt = `你是一個專業助手。以下是用戶提供的知識文檔：

===== 【${entry.name}】 =====
${entry.content.substring(0, 10000)}${entry.content.length > 10000 ? '\n...(內容過長，已截斷)' : ''}
===== 文檔結束 =====

請基於以上文檔內容回答用戶的問題。`

      const response = await window.electronAPI.copilot.chat(`verify-${entry.id}`, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `根據上述文檔，列出其中的主要內容或關鍵信息（20-50字）。` }
        ]
      })

      if (response.error) {
        throw new Error(response.error)
      }

      setLearningStatus(`✅ 驗證成功！AI 已能訪問知識庫內容：\n${response.content}`)
      setTimeout(() => setLearningStatus(''), 5000)

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      setLearningStatus(`❌ 驗證失敗：${errorMsg}`)
      setTimeout(() => setLearningStatus(''), 5000)
    } finally {
      setIsLearning(false)
    }
  }

  const filteredEntries = selectedCategory === 'all' 
    ? entries 
    : entries.filter(e => e.category === selectedCategory)

  const stats = knowledgeStore.getStats()

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '90%' }}>
        <div className="settings-header">
          <h2>📚 知識庫管理</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-content">
          {/* 統計資訊 */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '10px',
            marginBottom: '20px'
          }}>
            <div style={{
              padding: '12px',
              backgroundColor: '#2a2826',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#dfdbc3' }}>{stats.total}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>總知識條目</div>
            </div>
            <div style={{
              padding: '12px',
              backgroundColor: '#2a3826',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#7bbda4' }}>{stats.learned}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>已學習</div>
            </div>
            <div style={{
              padding: '12px',
              backgroundColor: '#3a2826',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{stats.pending}</div>
              <div style={{ fontSize: '12px', color: '#888' }}>待學習</div>
            </div>
            <div style={{
              padding: '12px',
              backgroundColor: '#2a2836',
              borderRadius: '6px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#dfdbc3' }}>
                {formatFileSize(stats.totalSize)}
              </div>
              <div style={{ fontSize: '12px', color: '#888' }}>總大小</div>
            </div>
          </div>

          {/* 類別篩選 */}
          <div style={{ marginBottom: '15px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setSelectedCategory('all')}
                style={{
                  padding: '6px 12px',
                  backgroundColor: selectedCategory === 'all' ? '#3a5836' : '#2a2826',
                  color: selectedCategory === 'all' ? '#7bbda4' : '#dfdbc3',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                📋 全部
              </button>
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: selectedCategory === cat.id ? '#3a5836' : '#2a2826',
                    color: selectedCategory === cat.id ? '#7bbda4' : '#dfdbc3',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  {cat.icon} {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* 學習狀態顯示 */}
          {learningStatus && (
            <div style={{
              padding: '12px',
              backgroundColor: learningStatus.startsWith('✅') ? '#2a3826' : learningStatus.startsWith('❌') ? '#3a2826' : '#2a2836',
              borderRadius: '6px',
              marginBottom: '15px',
              whiteSpace: 'pre-wrap',
              fontSize: '13px',
              color: learningStatus.startsWith('✅') ? '#7bbda4' : learningStatus.startsWith('❌') ? '#f87171' : '#dfdbc3'
            }}>
              {learningStatus}
            </div>
          )}

          {/* 操作按鈕 */}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap' }}>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.json,.csv,.log,.xlsx,.xls"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isLearning}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2a5826',
                color: '#7bbda4',
                border: 'none',
                borderRadius: '4px',
                cursor: isLearning ? 'not-allowed' : 'pointer',
                opacity: isLearning ? 0.5 : 1,
                fontSize: '13px'
              }}
            >
              📤 上傳文檔
            </button>
            <button
              onClick={async () => {
                const unlearned = entries.filter(e => !e.isLearned)
                for (const entry of unlearned) {
                  await learnKnowledge(entry)
                }
              }}
              disabled={isLearning || entries.filter(e => !e.isLearned).length === 0}
              style={{
                padding: '8px 16px',
                backgroundColor: '#3a2836',
                color: '#dfdbc3',
                border: 'none',
                borderRadius: '4px',
                cursor: isLearning ? 'not-allowed' : 'pointer',
                opacity: isLearning ? 0.5 : 1,
                fontSize: '13px'
              }}
            >
              🎓 學習全部
            </button>
            <button
              onClick={() => {
                const active = knowledgeStore.getActiveKnowledge()
                const msg = active.length > 0 
                  ? `✅ 知識庫狀態正常\n\n可用知識: ${active.length} 個\n${active.map(k => `• ${k.name} (${(k.content.length/1024).toFixed(1)} KB)`).join('\n')}`
                  : `⚠️ 知識庫為空\n\n請確認：\n1. 文件已上傳並標記為「已學習」\n2. 對應的類別已啟用（見下方設定）`
                alert(msg)
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#2a3836',
                color: '#7bbda4',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px'
              }}
            >
              🔍 檢查狀態
            </button>
          </div>

          {/* 知識列表 */}
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {filteredEntries.length === 0 ? (
              <div style={{
                padding: '40px',
                textAlign: 'center',
                color: '#888',
                fontSize: '14px'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '10px' }}>📭</div>
                <div>尚無知識條目</div>
                <div style={{ fontSize: '12px', marginTop: '5px' }}>點擊「上傳文檔」開始添加知識</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {filteredEntries.map(entry => {
                  const category = categories.find(c => c.id === entry.category)
                  return (
                    <div
                      key={entry.id}
                      style={{
                        padding: '12px',
                        backgroundColor: selectedEntry === entry.id ? '#3a3836' : '#2a2826',
                        borderRadius: '6px',
                        border: `1px solid ${entry.isLearned ? '#4a5836' : '#3a3836'}`,
                        cursor: 'pointer'
                      }}
                      onClick={() => setSelectedEntry(selectedEntry === entry.id ? null : entry.id)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '20px' }}>{category?.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 'bold', color: '#dfdbc3', marginBottom: '4px' }}>
                            {entry.name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#888', display: 'flex', gap: '10px' }}>
                            <span>{formatFileSize(entry.size)}</span>
                            <span>•</span>
                            <span>{new Date(entry.uploadedAt).toLocaleString('zh-TW')}</span>
                            {entry.isLearned && entry.learnedAt && (
                              <>
                                <span>•</span>
                                <span style={{ color: '#7bbda4' }}>
                                  ✅ {new Date(entry.learnedAt).toLocaleString('zh-TW')} 已學習
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {!entry.isLearned ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                learnKnowledge(entry)
                              }}
                              disabled={isLearning}
                              style={{
                                padding: '4px 12px',
                                backgroundColor: '#2a5826',
                                color: '#7bbda4',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isLearning ? 'not-allowed' : 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              🎓 學習
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                verifyLearned(entry)
                              }}
                              disabled={isLearning}
                              style={{
                                padding: '4px 12px',
                                backgroundColor: '#2a3836',
                                color: '#7bbda4',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: isLearning ? 'not-allowed' : 'pointer',
                                fontSize: '12px'
                              }}
                            >
                              ✓ 驗證
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (confirm(`確定要刪除「${entry.name}」嗎？`)) {
                                knowledgeStore.deleteEntry(entry.id)
                              }
                            }}
                            style={{
                              padding: '4px 12px',
                              backgroundColor: '#3a2826',
                              color: '#f87171',
                              border: 'none',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '12px'
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      {/* 展開顯示內容預覽 */}
                      {selectedEntry === entry.id && (
                        <div style={{
                          marginTop: '10px',
                          padding: '10px',
                          backgroundColor: '#1f1d1a',
                          borderRadius: '4px',
                          fontSize: '12px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          whiteSpace: 'pre-wrap',
                          fontFamily: 'monospace',
                          color: '#dfdbc3'
                        }}>
                          {entry.content}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* 類別啟用設定 */}
          <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #3a3836' }}>
            <h4 style={{ marginBottom: '10px', fontSize: '14px', color: '#dfdbc3' }}>
              啟用的知識類別
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {categories.map(cat => (
                <label
                  key={cat.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    backgroundColor: cat.enabled ? '#2a3826' : '#2a2826',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={cat.enabled}
                    onChange={e => knowledgeStore.toggleCategory(cat.id, e.target.checked)}
                  />
                  <span>{cat.icon}</span>
                  <span style={{ color: cat.enabled ? '#7bbda4' : '#888' }}>{cat.name}</span>
                </label>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: '#888', marginTop: '8px' }}>
              💡 只有已學習且啟用類別的知識會提供給 AI 使用
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
