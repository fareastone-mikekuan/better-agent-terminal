/**
 * 技能市場面板
 */

import { useState, useEffect } from 'react'
import { skillMarketplaceStore } from '../stores/skill-marketplace-store'
import { SkillMarketplacePackage, TELECOM_BILLING_CATEGORIES } from '../types/skill'

export function SkillMarketplacePanel() {
  const [state, setState] = useState(skillMarketplaceStore.getState())
  const [selectedPackage, setSelectedPackage] = useState<SkillMarketplacePackage | null>(null)
  const [showSourceManager, setShowSourceManager] = useState(false)

  useEffect(() => {
    const unsubscribe = skillMarketplaceStore.subscribe(() => {
      setState(skillMarketplaceStore.getState())
    })

    return unsubscribe
  }, [])

  const handleInstall = async (pkg: SkillMarketplacePackage) => {
    try {
      await skillMarketplaceStore.installPackage(pkg.id)
      alert(`✅ 已成功安裝技能: ${pkg.skill.name}`)
    } catch (error: any) {
      alert(`❌ 安裝失敗: ${error.message}`)
    }
  }

  const packages = skillMarketplaceStore.getPackages()

  return (
    <div style={{ display: 'flex', height: '100%', background: 'var(--bg-primary)' }}>
      {/* 左侧：分类和搜索 */}
      <div style={{ width: 250, borderRight: '1px solid var(--border-color)', padding: 16, overflowY: 'auto' }}>
        <h3 style={{ color: 'var(--text-primary)', marginBottom: 16, fontSize: 16 }}>🏪 技能市場</h3>

        {/* 搜索框 */}
        <input
          type="text"
          placeholder="搜索技能..."
          value={state.searchQuery}
          onChange={(e) => skillMarketplaceStore.setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            fontSize: 13,
            marginBottom: 16,
            outline: 'none'
          }}
        />

        {/* 分类列表 */}
        <div style={{ marginBottom: 16 }}>
          <div
            onClick={() => skillMarketplaceStore.setSelectedCategory(undefined)}
            style={{
              padding: '8px 12px',
              background: !state.selectedCategory ? '#0078d4' : 'transparent',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--text-primary)',
              fontSize: 13,
              marginBottom: 4,
              transition: 'all 0.2s'
            }}
          >
            📦 全部技能 ({packages.length})
          </div>

          {TELECOM_BILLING_CATEGORIES.map(category => {
            const count = skillMarketplaceStore.getPackages().filter(p => p.skill.category === category.id).length
            return (
              <div
                key={category.id}
                onClick={() => skillMarketplaceStore.setSelectedCategory(category.id)}
                style={{
                  padding: '8px 12px',
                  background: state.selectedCategory === category.id ? '#0078d4' : 'transparent',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  marginBottom: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{category.icon}</span>
                  <span>{category.name}</span>
                </div>
                {count > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>({count})</span>
                )}
              </div>
            )
          })}
        </div>

        {/* 同步按钮 */}
        <button
          onClick={() => skillMarketplaceStore.syncPackages()}
          disabled={state.isLoading}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: '#0078d4',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 13,
            cursor: state.isLoading ? 'not-allowed' : 'pointer',
            opacity: state.isLoading ? 0.5 : 1,
            marginBottom: 8
          }}
        >
          {state.isLoading ? '同步中...' : '🔄 同步市場'}
        </button>

        {/* 管理源按钮 */}
        <button
          onClick={() => setShowSourceManager(true)}
          style={{
            width: '100%',
            padding: '8px 12px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border-color)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            fontSize: 13,
            cursor: 'pointer'
          }}
        >
          ⚙️ 管理源
        </button>
      </div>

      {/* 中间：技能列表 */}
      <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
        {packages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏪</div>
            <p>市場暫無技能</p>
            <p style={{ fontSize: 13 }}>
              {state.isLoading ? '正在同步中...' : '點擊「🔄 同步市場」或「⚙️ 管理源」開始'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {packages.map(pkg => (
              <div
                key={pkg.id}
                onClick={() => setSelectedPackage(pkg)}
                style={{
                  background: 'var(--bg-secondary)',
                  borderRadius: 8,
                  padding: 16,
                  cursor: 'pointer',
                  border: selectedPackage?.id === pkg.id ? '2px solid #0078d4' : '1px solid var(--border-color)',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>{pkg.skill.icon || '🤖'}</span>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <h4 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {pkg.skill.name}
                    </h4>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>by {pkg.metadata.author}</div>
                  </div>
                </div>

                <p style={{ color: 'var(--text-secondary)', fontSize: 12, margin: '8px 0', height: 36, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {pkg.skill.description}
                </p>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  {pkg.skill.tags.slice(0, 3).map(tag => (
                    <span key={tag} style={{
                      background: 'var(--bg-tertiary)',
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 10,
                      color: 'var(--text-secondary)'
                    }}>
                      {tag}
                    </span>
                  ))}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
                  <span>⭐ {pkg.metadata.rating.toFixed(1)}</span>
                  <span>📥 {pkg.metadata.downloads}</span>
                  <span>v{pkg.metadata.version}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 右侧：详情面板 */}
      {selectedPackage && (
        <div style={{ width: 400, borderLeft: '1px solid var(--border-color)', padding: 16, overflowY: 'auto', background: 'var(--bg-secondary)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 48 }}>{selectedPackage.skill.icon || '🤖'}</span>
            <div style={{ flex: 1 }}>
              <h2 style={{ color: 'var(--text-primary)', margin: 0, fontSize: 18 }}>{selectedPackage.skill.name}</h2>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                by {selectedPackage.metadata.author} • v{selectedPackage.metadata.version}
              </div>
            </div>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            {selectedPackage.skill.description}
          </p>

          <button
            onClick={() => handleInstall(selectedPackage)}
            style={{
              width: '100%',
              padding: '12px 16px',
              background: '#0078d4',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              fontSize: 14,
              fontWeight: 'bold',
              cursor: 'pointer',
              marginBottom: 16
            }}
          >
            📥 安裝技能
          </button>

          <div style={{ marginBottom: 16 }}>
            <h4 style={{ color: 'var(--text-primary)', fontSize: 14, marginBottom: 8 }}>📊 統計資訊</h4>
            <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.8 }}>
              <div>⭐ 評分: {selectedPackage.metadata.rating.toFixed(1)} / 5.0</div>
              <div>💬 評論: {selectedPackage.metadata.reviews}</div>
              <div>📥 下載: {selectedPackage.metadata.downloads}</div>
              <div>📅 更新: {new Date(selectedPackage.metadata.lastUpdated).toLocaleDateString('zh-TW')}</div>
            </div>
          </div>

          {selectedPackage.skill.tags.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ color: 'var(--text-primary)', fontSize: 14, marginBottom: 8 }}>🏷️ 標籤</h4>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedPackage.skill.tags.map(tag => (
                  <span key={tag} style={{
                    background: 'var(--bg-tertiary)',
                    padding: '4px 12px',
                    borderRadius: 4,
                    fontSize: 12,
                    color: 'var(--text-secondary)'
                  }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {selectedPackage.metadata.license && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ color: 'var(--text-primary)', fontSize: 14, marginBottom: 8 }}>📜 授權</h4>
              <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>{selectedPackage.metadata.license}</div>
            </div>
          )}

          {selectedPackage.readme && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ color: 'var(--text-primary)', fontSize: 14, marginBottom: 8 }}>📖 說明</h4>
              <div style={{
                background: 'var(--bg-tertiary)',
                padding: 12,
                borderRadius: 6,
                color: 'var(--text-secondary)',
                fontSize: 12,
                lineHeight: 1.6,
                whiteSpace: 'pre-wrap'
              }}>
                {selectedPackage.readme}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 源管理对话框 */}
      {showSourceManager && (
        <SourceManagerDialog onClose={() => setShowSourceManager(false)} />
      )}
    </div>
  )
}

// 源管理对话框
function SourceManagerDialog({ onClose }: { onClose: () => void }) {
  const [sources, setSources] = useState(skillMarketplaceStore.getSources())

  useEffect(() => {
    const unsubscribe = skillMarketplaceStore.subscribe(() => {
      setSources(skillMarketplaceStore.getSources())
    })
    return unsubscribe
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-primary)',
          borderRadius: 8,
          width: '90%',
          maxWidth: 600,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 16 }}>⚙️ 管理技能市場源</h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              fontSize: 24,
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {sources.map(source => (
            <div key={source.id} style={{ padding: 12, background: 'var(--bg-secondary)', borderRadius: 6, marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, color: 'var(--text-primary)', fontSize: 14 }}>{source.name}</h4>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>{source.url}</div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onChange={() => skillMarketplaceStore.toggleSource(source.id)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>啟用</span>
                </label>
              </div>
              {source.lastSync && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                  最後同步: {new Date(source.lastSync).toLocaleString('zh-TW')}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: 16, borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            💡 提示：啟用源後點擊「同步市場」即可下載技能
          </div>
        </div>
      </div>
    </div>
  )
}
