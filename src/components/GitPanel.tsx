import { useState, useEffect } from 'react'
import { workspaceStore } from '../stores/workspace-store'

interface GitPanelProps {
  isVisible: boolean
  onClose: () => void
  isFloating: boolean
  workspaceId: string
}

interface GitLog {
  hash: string
  author: string
  date: string
  message: string
}

interface GitStatus {
  branch: string
  ahead: number
  behind: number
  modified: number
  staged: number
  untracked: number
}

interface RemoteInfo {
  name: string
  url: string
  type: 'fetch' | 'push'
}

export function GitPanel({ isVisible, onClose, isFloating, workspaceId }: GitPanelProps) {
  const [activeTab, setActiveTab] = useState<'status' | 'log' | 'remote'>('status')
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null)
  const [gitLogs, setGitLogs] = useState<GitLog[]>([])
  const [remotes, setRemotes] = useState<RemoteInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [repoPath, setRepoPath] = useState<string>('')
  const [isGitRepo, setIsGitRepo] = useState(false)

  // Get workspace path
  useEffect(() => {
    const workspace = workspaceStore.getState().workspaces.find(w => w.id === workspaceId)
    if (workspace) {
      setRepoPath(workspace.folderPath)
      checkGitRepo()
    }
  }, [workspaceId])

  const checkGitRepo = async () => {
    setLoading(true)
    try {
      // Try to run a simple git command to check if it's a git repo
      const output = await runGitCommand('git rev-parse --git-dir')
      
      // Check if output contains error messages
      if (output.includes('not a git repository') || 
          output.includes('fatal:') || 
          output.toLowerCase().includes('error')) {
        setIsGitRepo(false)
        setLoading(false)
        return
      }
      
      setIsGitRepo(true)
      await loadGitData()
    } catch (err) {
      console.error('Git check failed:', err)
      setIsGitRepo(false)
    } finally {
      setLoading(false)
    }
  }

  const runGitCommand = async (command: string): Promise<string> => {
    // Parse command into args
    const parts = command.split(/\s+/)
    if (parts[0] !== 'git') {
      throw new Error('Invalid git command')
    }
    
    const args = parts.slice(1) // Remove 'git' prefix
    
    try {
      console.log('[Git] Executing git', args, 'in', repoPath)
      const result = await window.electronAPI.git.execute(repoPath, args)
      
      if (!result.success) {
        console.error('[Git] Command failed:', result.error)
        throw new Error(result.error)
      }
      
      console.log('[Git] Output:', result.output)
      return result.output
    } catch (error: any) {
      console.error('[Git] Execution error:', error)
      throw error
    }
  }

  const loadGitData = async () => {
    if (!isGitRepo) return
    
    setLoading(true)
    setError(null)
    
    try {
      await Promise.all([
        loadGitStatus(),
        loadGitLog(),
        loadRemotes()
      ])
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '無法載入 Git 資料'
      setError(errorMsg)
      // If git commands fail, it's probably not a git repo
      if (errorMsg.includes('not a git repository')) {
        setIsGitRepo(false)
      }
    } finally {
      setLoading(false)
    }
  }

  const loadGitStatus = async () => {
    try {
      // Get branch name
      const branchOutput = await runGitCommand('git branch --show-current')
      console.log('[Git] Branch raw output length:', branchOutput.length)
      
      // Clean up output - remove ANSI codes, prompts, command echo, and error messages
      const cleanLines = branchOutput
        .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI codes
        .replace(/\r/g, '')              // Remove carriage returns
        .split('\n')
        .map(l => l.trim())
        .filter(line => {
          // Skip empty lines, command echoes, shell prompts
          if (!line) return false
          if (line.includes('git branch')) return false
          if (line.match(/^[\$#>]/)) return false
          if (line.includes('mikekuan@')) return false
          return true
        })
      
      console.log('[Git] Cleaned branch lines:', cleanLines)
      const branch = cleanLines[0] || 'unknown'
      console.log('[Git] Final branch:', branch)

      // Get ahead/behind (this might fail if no upstream)
      let ahead = 0
      let behind = 0
      try {
        const revListOutput = await runGitCommand('git rev-list --left-right --count HEAD...@{upstream}')
        console.log('[Git] Rev-list output:', revListOutput)
        
        const cleanRevList = revListOutput
          .replace(/\x1b\[[0-9;]*m/g, '')
          .split('\n')
          .filter(l => l.trim() && !l.includes('git') && !l.match(/^[\$#>]/))
          .map(l => l.trim())
        
        if (cleanRevList.length > 0) {
          const counts = cleanRevList[0].split(/\s+/).map(Number)
          ahead = counts[0] || 0
          behind = counts[1] || 0
        }
      } catch (err) {
        console.log('[Git] No upstream configured:', err)
      }

      // Get file status
      const statusOutput = await runGitCommand('git status --porcelain')
      console.log('[Git] Status raw output:', statusOutput)
      
      const statusLines = statusOutput
        .replace(/\x1b\[[0-9;]*m/g, '')
        .split('\n')
        .map(l => l.trim())
        .filter(line => {
          if (!line) return false
          if (line.includes('git status')) return false
          if (line.match(/^[\$#>]/)) return false
          if (line.includes('mikekuan@')) return false
          // Valid status lines start with space, ?, A, M, D, R, C, U
          return line.match(/^[\s?AMDRCUL]{2}/)
        })
      
      console.log('[Git] Cleaned status lines:', statusLines)
      
      const staged = statusLines.filter(l => l[0] !== ' ' && l[0] !== '?').length
      const modified = statusLines.filter(l => l[1] === 'M' || l.includes(' M ')).length
      const untracked = statusLines.filter(l => l.startsWith('??')).length

      console.log('[Git] Parsed status:', { branch, ahead, behind, staged, modified, untracked })

      setGitStatus({
        branch,
        ahead,
        behind,
        modified,
        staged,
        untracked
      })
      setIsGitRepo(true)
    } catch (err) {
      console.error('Failed to load git status:', err)
      setIsGitRepo(false)
      throw err
    }
  }

  const loadGitLog = async () => {
    try {
      const output = await runGitCommand('git log --pretty=format:"%h|%an|%ar|%s" -20')
      console.log('[Git] Log output:', output)
      
      const logs = output
        .replace(/\x1b\[[0-9;]*m/g, '')
        .split('\n')
        .filter(l => {
          const trimmed = l.trim()
          return trimmed && 
                 l.includes('|') && 
                 !trimmed.includes('$') && 
                 !trimmed.includes('>') &&
                 !trimmed.includes('execvp')
        })
        .map(line => {
          const [hash, author, date, ...messageParts] = line.split('|')
          return { 
            hash: hash?.replace(/["\r]/g, '').trim() || '', 
            author: author?.trim() || '', 
            date: date?.trim() || '', 
            message: messageParts.join('|').replace(/"/g, '').trim() 
          }
        })
        .filter(log => log.hash && log.hash.length > 0)
      
      console.log('[Git] Parsed logs:', logs.length, 'entries')
      setGitLogs(logs)
    } catch (err) {
      console.error('Failed to load git log:', err)
    }
  }

  const loadRemotes = async () => {
    try {
      const output = await runGitCommand('git remote -v')
      console.log('[Git] Remote output:', output)
      
      const remoteList = output
        .replace(/\x1b\[[0-9;]*m/g, '')
        .split('\n')
        .filter(l => {
          const trimmed = l.trim()
          return trimmed && 
                 trimmed.includes('\t') && 
                 !trimmed.includes('$') && 
                 !trimmed.includes('>') &&
                 !trimmed.includes('execvp')
        })
        .map(line => {
          const parts = line.split(/\s+/)
          return {
            name: parts[0] || '',
            url: parts[1] || '',
            type: parts[2]?.includes('fetch') ? 'fetch' as const : 'push' as const
          }
        })
        .filter(r => r.name && r.url)
      
      console.log('[Git] Parsed remotes:', remoteList.length, 'entries')
      setRemotes(remoteList)
    } catch (err) {
      console.error('Failed to load remotes:', err)
    }
  }

  const handleFetch = async () => {
    setLoading(true)
    try {
      await runGitCommand('git fetch')
      await loadGitData()
    } catch (err) {
      setError('無法 fetch 更新')
    } finally {
      setLoading(false)
    }
  }

  const handlePull = async () => {
    setLoading(true)
    try {
      await runGitCommand('git pull')
      await loadGitData()
    } catch (err) {
      setError('無法 pull 更新')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckoutCommit = async (hash: string) => {
    if (confirm(`切換到提交 ${hash}？`)) {
      setLoading(true)
      try {
        await runGitCommand(`git checkout ${hash}`)
        await loadGitData()
      } catch (err) {
        setError('無法切換提交')
      } finally {
        setLoading(false)
      }
    }
  }

  if (!isVisible && isFloating) return null

  if (!isGitRepo) {
    const isGitNotFound = error?.includes('Git 命令未找到') || error?.includes('execvp')
    
    return (
      <div style={{ 
        padding: '20px', 
        color: '#888',
        textAlign: 'center',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px'
      }}>
        <div style={{ fontSize: '48px' }}>{isGitNotFound ? '⚠️' : '📁'}</div>
        <div>{isGitNotFound ? 'Git 未安裝' : '此工作區不是 Git 儲存庫'}</div>
        {isGitNotFound ? (
          <div style={{ fontSize: '12px', color: '#666', maxWidth: '300px', lineHeight: '1.6' }}>
            請先安裝 Git：<br/>
            Ubuntu/Debian: sudo apt install git<br/>
            macOS: brew install git<br/>
            Windows: 從 git-scm.com 下載
          </div>
        ) : (
          <div style={{ fontSize: '12px', color: '#666' }}>
            路徑: {repoPath}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: '#1e1e1e',
      color: '#e0e0e0'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid #333',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#252526'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🔀</span>
          <span style={{ fontWeight: 500 }}>Git 版本控制</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={loadGitData}
            disabled={loading}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              backgroundColor: '#3a3a3a',
              color: '#e0e0e0',
              border: '1px solid #555',
              borderRadius: '3px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.5 : 1
            }}
          >
            {loading ? '更新中...' : '🔄 重新整理'}
          </button>
          {isFloating && (
            <button
              onClick={onClose}
              style={{
                padding: '4px 8px',
                fontSize: '14px',
                backgroundColor: 'transparent',
                color: '#e0e0e0',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        padding: '8px 12px',
        borderBottom: '1px solid #333',
        backgroundColor: '#2a2a2a'
      }}>
        {['status', 'log', 'remote'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as typeof activeTab)}
            style={{
              padding: '6px 16px',
              fontSize: '12px',
              backgroundColor: activeTab === tab ? '#3a3a3a' : 'transparent',
              color: activeTab === tab ? '#7bbda4' : '#999',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontWeight: activeTab === tab ? 500 : 400
            }}
          >
            {tab === 'status' && '📊 狀態'}
            {tab === 'log' && '📜 歷史記錄'}
            {tab === 'remote' && '🌐 遠端倉庫'}
          </button>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#ff4444',
          color: '#fff',
          fontSize: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '16px'
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
        {activeTab === 'status' && gitStatus && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Branch info */}
            <div style={{
              backgroundColor: '#2a2a2a',
              padding: '12px',
              borderRadius: '4px',
              border: '1px solid #3a3a3a'
            }}>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px' }}>目前分支</div>
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                fontSize: '14px',
                fontFamily: 'monospace'
              }}>
                <span style={{ color: '#7bbda4' }}>🌿</span>
                <span style={{ fontWeight: 500 }}>{gitStatus.branch}</span>
              </div>
            </div>

            {/* Sync status */}
            {(gitStatus.ahead > 0 || gitStatus.behind > 0) && (
              <div style={{
                backgroundColor: '#3a3a1a',
                padding: '12px',
                borderRadius: '4px',
                border: '1px solid #5a5a2a'
              }}>
                <div style={{ fontSize: '12px', color: '#fc0', marginBottom: '8px' }}>
                  ⚠️ 需要同步
                </div>
                <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
                  {gitStatus.ahead > 0 && (
                    <span>↑ {gitStatus.ahead} 個提交待推送</span>
                  )}
                  {gitStatus.behind > 0 && (
                    <span>↓ {gitStatus.behind} 個提交待拉取</span>
                  )}
                </div>
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleFetch}
                    disabled={loading}
                    style={{
                      padding: '6px 12px',
                      fontSize: '12px',
                      backgroundColor: '#4a4a4a',
                      color: '#e0e0e0',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: loading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Fetch
                  </button>
                  {gitStatus.behind > 0 && (
                    <button
                      onClick={handlePull}
                      disabled={loading}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        backgroundColor: '#7bbda4',
                        color: '#1e1e1e',
                        border: 'none',
                        borderRadius: '3px',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontWeight: 500
                      }}
                    >
                      Pull
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* File changes */}
            <div style={{
              backgroundColor: '#2a2a2a',
              padding: '12px',
              borderRadius: '4px',
              border: '1px solid #3a3a3a'
            }}>
              <div style={{ fontSize: '12px', color: '#888', marginBottom: '12px' }}>變更檔案</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                {gitStatus.staged > 0 && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ color: '#4CAF50' }}>✓</span>
                    <span>{gitStatus.staged} 個已暫存</span>
                  </div>
                )}
                {gitStatus.modified > 0 && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ color: '#FFA500' }}>●</span>
                    <span>{gitStatus.modified} 個已修改</span>
                  </div>
                )}
                {gitStatus.untracked > 0 && (
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <span style={{ color: '#888' }}>?</span>
                    <span>{gitStatus.untracked} 個未追蹤</span>
                  </div>
                )}
                {gitStatus.staged === 0 && gitStatus.modified === 0 && gitStatus.untracked === 0 && (
                  <div style={{ color: '#7bbda4' }}>✨ 工作區乾淨</div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'log' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {gitLogs.map(log => (
              <div
                key={log.hash}
                onClick={() => handleCheckoutCommit(log.hash)}
                style={{
                  padding: '10px 12px',
                  backgroundColor: '#2a2a2a',
                  borderRadius: '4px',
                  border: '1px solid #3a3a3a',
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#3a3a3a'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#2a2a2a'}
              >
                <div style={{ 
                  display: 'flex', 
                  gap: '12px', 
                  marginBottom: '6px',
                  fontSize: '12px'
                }}>
                  <span style={{ 
                    fontFamily: 'monospace', 
                    color: '#fc0',
                    fontWeight: 500
                  }}>
                    {log.hash}
                  </span>
                  <span style={{ color: '#888' }}>{log.date}</span>
                </div>
                <div style={{ fontSize: '13px', marginBottom: '4px' }}>{log.message}</div>
                <div style={{ fontSize: '11px', color: '#666' }}>by {log.author}</div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'remote' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {remotes.length > 0 ? (
              remotes.map((remote, idx) => (
                <div
                  key={`${remote.name}-${idx}`}
                  style={{
                    padding: '12px',
                    backgroundColor: '#2a2a2a',
                    borderRadius: '4px',
                    border: '1px solid #3a3a3a'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    gap: '8px', 
                    alignItems: 'center',
                    marginBottom: '8px'
                  }}>
                    <span style={{ fontSize: '14px' }}>
                      {remote.type === 'fetch' ? '📥' : '📤'}
                    </span>
                    <span style={{ 
                      fontWeight: 500,
                      color: '#7bbda4',
                      fontFamily: 'monospace'
                    }}>
                      {remote.name}
                    </span>
                    <span style={{ 
                      fontSize: '11px',
                      color: '#666',
                      padding: '2px 6px',
                      backgroundColor: '#3a3a3a',
                      borderRadius: '3px'
                    }}>
                      {remote.type}
                    </span>
                  </div>
                  <div style={{ 
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    color: '#999',
                    wordBreak: 'break-all'
                  }}>
                    {remote.url}
                  </div>
                </div>
              ))
            ) : (
              <div style={{ color: '#888', textAlign: 'center', padding: '20px' }}>
                無遠端倉庫
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
