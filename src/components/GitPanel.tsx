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
  const [savedRepos, setSavedRepos] = useState<Array<{path: string; name: string}>>([])
  const [newRepoInput, setNewRepoInput] = useState('')
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null)
  const [commitDetails, setCommitDetails] = useState<string>('')
  const [availableBranches, setAvailableBranches] = useState<Array<{name: string; hash: string}>>([])
  const [selectedBranch, setSelectedBranch] = useState<string>('')

  // Auto-detect workspace Git repository on mount
  useEffect(() => {
    const detectWorkspaceGit = async () => {
      try {
        // Get current workspace
        const state = workspaceStore.getState()
        const workspace = state.workspaces.find(w => w.id === workspaceId)
        if (!workspace) return

        // Get active terminal's cwd from the workspace
        const terminals = state.terminals.filter(t => t.workspaceId === workspaceId)
        const activeTerminal = terminals.find(t => t.type === 'terminal')
        
        if (activeTerminal) {
          const cwd = await window.electronAPI.pty.getCwd(activeTerminal.id)
          if (cwd && cwd.trim()) {
            console.log('[Git] Auto-detecting Git repo in:', cwd)
            // Don't override if user already selected a repo
            if (!repoPath) {
              setRepoPath(cwd)
            }
          }
        }
      } catch (err) {
        console.error('[Git] Failed to auto-detect workspace:', err)
      }
    }

    detectWorkspaceGit()
  }, [workspaceId])

  // Load saved repos from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('git-repos')
    if (saved) {
      try {
        const repos = JSON.parse(saved)
        setSavedRepos(repos)
        // Auto-select first repo if none selected and no workspace detected
        if (repos.length > 0 && !repoPath) {
          setRepoPath(repos[0].path)
        }
      } catch (e) {
        console.error('Failed to load saved repos:', e)
      }
    }
  }, [])

  // Check git repo when path changes
  useEffect(() => {
    if (repoPath && repoPath.trim()) {
      checkGitRepo()
    }
  }, [repoPath])

  const checkGitRepo = async () => {
    setLoading(true)
    try {
      // 如果是 URL，用 ls-remote 检查；如果是本地路径，用 rev-parse
      const isUrl = repoPath.startsWith('http://') || repoPath.startsWith('https://') || repoPath.startsWith('git@')
      
      if (isUrl) {
        // 对于远程 URL，使用 ls-remote 检查
        await runGitCommand(`git ls-remote ${repoPath} HEAD`, true)
        setIsGitRepo(true)
        await loadGitData()
      } else {
        // 本地仓库检查
        const output = await runGitCommand('git rev-parse --git-dir', false)
        
        if (output.includes('not a git repository') || 
            output.includes('fatal:') || 
            output.toLowerCase().includes('error')) {
          setIsGitRepo(false)
          setLoading(false)
          return
        }
        
        setIsGitRepo(true)
        await loadGitData()
      }
    } catch (err) {
      console.error('Git check failed:', err)
      setIsGitRepo(false)
      setError('❌ 無法連接到此儲存庫')
    } finally {
      setLoading(false)
    }
  }

  const runGitCommand = async (command: string, isRemote = false): Promise<string> => {
    // Parse command into args
    const parts = command.split(/\s+/)
    if (parts[0] !== 'git') {
      throw new Error('Invalid git command')
    }
    
    const args = parts.slice(1) // Remove 'git' prefix
    
    try {
      // 如果是远程命令（URL），使用临时目录；否则使用 repoPath
      const cwd = isRemote ? '/tmp' : repoPath
      console.log('[Git] Executing git', args, 'in', cwd)
      const result = await window.electronAPI.git.execute(cwd, args)
      
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
    if (!repoPath) {
      setError('請選擇 Git 儲存庫目錄或輸入 GitHub URL')
      return
    }
    if (!isGitRepo) return
    
    setLoading(true)
    setError(null)
    
    try {
      const isUrl = repoPath.startsWith('http://') || repoPath.startsWith('https://') || repoPath.startsWith('git@')
      
      if (isUrl) {
        // 对于 URL，使用 ls-remote 获取信息
        await loadRemoteData()
      } else {
        // 本地仓库的正常流程
        await Promise.all([
          loadGitStatus(),
          loadGitLog(),
          loadRemotes()
        ])
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '無法載入 Git 資料'
      setError(errorMsg)
      if (errorMsg.includes('not a git repository')) {
        setIsGitRepo(false)
      }
    } finally {
      setLoading(false)
    }
  }

  const loadRemoteData = async () => {
    try {
      // 使用 ls-remote 获取所有 refs
      const output = await runGitCommand(`git ls-remote --heads --tags ${repoPath}`, true)
      
      // 解析输出
      const lines = output.split('\n').filter(l => l.trim())
      
      // 提取分支及其 commit hash
      const branches = lines
        .filter(l => l.includes('refs/heads/'))
        .map(l => {
          const parts = l.split(/\s+/)
          const hash = parts[0]
          const match = l.match(/refs\/heads\/(.+)$/)
          const name = match ? match[1] : ''
          return { name, hash }
        })
        .filter(b => b.name)
      
      // 提取标签
      const tags = lines
        .filter(l => l.includes('refs/tags/'))
        .map(l => {
          const match = l.match(/refs\/tags\/(.+)$/)
          return match ? match[1] : ''
        })
        .filter(Boolean)
      
      // 保存所有分支
      setAvailableBranches(branches)
      
      // 设置当前分支（默认为 main 或 master，或使用用户选择的）
      const defaultBranch = selectedBranch 
        ? branches.find(b => b.name === selectedBranch)
        : (branches.find(b => b.name === 'main') || 
           branches.find(b => b.name === 'master') || 
           branches[0])
      
      if (defaultBranch && !selectedBranch) {
        setSelectedBranch(defaultBranch.name)
      }
      
      // 设置状态为远程仓库信息
      setGitStatus({
        branch: defaultBranch?.name || 'N/A',
        ahead: 0,
        behind: 0,
        modified: 0,
        staged: 0,
        untracked: 0
      })
      
      // 获取默认分支的提交历史（使用浅克隆）
      if (defaultBranch) {
        try {
          console.log('[Git] Fetching remote history for', repoPath, 'branch', defaultBranch.name)
          const result = await window.electronAPI.git.fetchRemoteHistory(repoPath, defaultBranch.name)
          
          if (result.success && result.output) {
            const logLines = result.output.split('\n').filter(l => l.trim())
            const logEntries: GitLog[] = logLines.map(line => {
              const [hash, author, date, ...messageParts] = line.split('|')
              return {
                hash: hash?.substring(0, 7) || '',
                author: author || 'Unknown',
                date: date || '',
                message: messageParts.join('|') || ''
              }
            })
            
            setGitLogs(logEntries.length > 0 ? logEntries : [
              { hash: 'remote-info', author: 'Remote', date: '', message: `無法取得提交歷史` }
            ])
          } else {
            // 如果获取历史失败，显示分支信息
            setGitLogs([
              { hash: 'remote-branches', author: 'Remote', date: '', message: `分支: ${branches.map(b => b.name).join(', ')}` },
              { hash: 'remote-tags', author: 'Remote', date: '', message: `標籤: ${tags.slice(0, 10).join(', ')}` },
              { hash: 'remote-error', author: 'System', date: '', message: `提示：無法取得提交歷史 - ${result.error || '請檢查網路連線'}` }
            ])
          }
        } catch (logErr) {
          console.error('Failed to fetch commit history:', logErr)
          // 如果获取历史失败，显示分支信息
          setGitLogs([
            { hash: 'remote-branches', author: 'Remote', date: '', message: `分支: ${branches.map(b => b.name).join(', ')}` },
            { hash: 'remote-tags', author: 'Remote', date: '', message: `標籤: ${tags.slice(0, 10).join(', ')}` }
          ])
        }
      } else {
        // 没有分支，只显示标签
        setGitLogs([
          { hash: 'remote-tags', author: 'Remote', date: '', message: `標籤: ${tags.join(', ')}` }
        ])
      }
      
      // 设置远程信息
      setRemotes([{ name: 'origin', url: repoPath, type: 'fetch' }])
    } catch (err) {
      console.error('Failed to load remote data:', err)
      throw err
    }
  }

  const handleSelectRepo = async () => {
    try {
      const result = await window.electronAPI.dialog.selectFolder()
      if (result) {
        addRepo(result)
      }
    } catch (err) {
      console.error('Failed to select folder:', err)
    }
  }

  const handleSwitchBranch = async (branchName: string) => {
    setSelectedBranch(branchName)
    setSelectedCommit(null)
    setCommitDetails('')
    // 重新加载 git 数据
    await loadGitData()
  }

  const handleViewCommit = async (hash: string) => {
    if (!hash || hash.startsWith('remote-')) {
      // 远程仓库或空 hash 不处理
      return
    }
    
    // 检查是否为远程 URL
    const isUrl = repoPath.startsWith('http://') || repoPath.startsWith('https://') || repoPath.startsWith('git@')
    
    try {
      setSelectedCommit(hash)
      setLoading(true)
      setError(null)
      
      if (isUrl) {
        // 远程仓库：使用临时克隆获取提交详情
        const currentBranch = gitStatus?.branch || 'main'
        console.log('[Git] Fetching remote commit details:', hash, 'from', repoPath)
        
        const result = await window.electronAPI.git.fetchRemoteCommitDetails(repoPath, hash, currentBranch)
        
        if (result.success && result.output) {
          setCommitDetails(result.output)
        } else {
          setCommitDetails(`無法獲取提交詳情\n\n錯誤：${result.error || '未知錯誤'}`)
          setError('❌ 無法獲取提交詳情')
        }
      } else {
        // 本地仓库：直接运行 git show
        const output = await runGitCommand(`git show --stat --pretty=fuller ${hash}`, false)
        setCommitDetails(output)
      }
    } catch (err) {
      console.error('Failed to load commit details:', err)
      setError('無法載入提交詳情')
      setCommitDetails(`錯誤：${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setLoading(false)
    }
  }

  const handleAddRepoFromInput = () => {
    const input = newRepoInput.trim()
    if (!input) return
    
    addRepo(input)
    setNewRepoInput('')
  }

  const addRepo = (path: string) => {
    setRepoPath(path)
    
    // Save to localStorage
    const repoName = path.split('/').pop() || path.split('\\').pop() || path
    const existing = savedRepos.find(r => r.path === path)
    if (!existing) {
      const updated = [...savedRepos, { path, name: repoName }]
      setSavedRepos(updated)
      localStorage.setItem('git-repos', JSON.stringify(updated))
    }
  }

  const handleSelectSavedRepo = (path: string) => {
    setRepoPath(path)
  }

  const handleRemoveSavedRepo = (path: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const updated = savedRepos.filter(r => r.path !== path)
    setSavedRepos(updated)
    localStorage.setItem('git-repos', JSON.stringify(updated))
    
    // If removing current repo, select another one
    if (path === repoPath && updated.length > 0) {
      setRepoPath(updated[0].path)
    } else if (updated.length === 0) {
      setRepoPath('')
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

  // 如果没有选择仓库，显示欢迎界面
  if (!repoPath) {
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
        <div style={{ fontSize: '48px' }}>📁</div>
        <div style={{ fontSize: '16px', color: '#e0e0e0' }}>尚未選擇 Git 儲存庫</div>
        <div style={{ fontSize: '12px', color: '#666', maxWidth: '400px', lineHeight: '1.6' }}>
          請在左側輸入 GitHub URL 或本地路徑，<br/>
          或點擊「📁 瀏覽」選擇本地 Git 目錄
        </div>
      </div>
    )
  }

  // 如果选择了路径但不是 Git 仓库
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
        <div>{isGitNotFound ? 'Git 未安裝' : '此目錄不是 Git 儲存庫'}</div>
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
      backgroundColor: '#1e1e1e',
      color: '#e0e0e0'
    }}>
      {/* Left Sidebar - Repository List */}
      <div style={{
        width: '280px',
        borderRight: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#252526'
      }}>
        {/* Sidebar Header */}
        <div style={{
          padding: '12px',
          borderBottom: '1px solid #333',
          fontWeight: 500,
          fontSize: '13px'
        }}>
          🔀 Git 儲存庫
        </div>

        {/* Add Repository Input */}
        <div style={{
          padding: '8px',
          borderBottom: '1px solid #333',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px'
        }}>
          <input
            type="text"
            value={newRepoInput}
            onChange={(e) => setNewRepoInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddRepoFromInput()}
            placeholder="GitHub URL 或本地路徑：https://github.com/user/repo.git"
            style={{
              padding: '6px 8px',
              fontSize: '12px',
              backgroundColor: '#3c3c3c',
              color: '#e0e0e0',
              border: '1px solid #555',
              borderRadius: '3px',
              outline: 'none'
            }}
          />
          <div style={{ display: 'flex', gap: '4px' }}>
            <button
              onClick={handleAddRepoFromInput}
              disabled={!newRepoInput.trim()}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: '11px',
                backgroundColor: '#0e639c',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                cursor: newRepoInput.trim() ? 'pointer' : 'not-allowed',
                opacity: newRepoInput.trim() ? 1 : 0.5
              }}
            >
              ➕ 加入
            </button>
            <button
              onClick={handleSelectRepo}
              style={{
                flex: 1,
                padding: '4px 8px',
                fontSize: '11px',
                backgroundColor: '#3a3a3a',
                color: '#e0e0e0',
                border: '1px solid #555',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              📁 瀏覽
            </button>
          </div>
        </div>

        {/* Repository List */}
        <div style={{
          flex: 1,
          overflow: 'auto'
        }}>
          {savedRepos.length === 0 ? (
            <div style={{
              padding: '16px',
              textAlign: 'center',
              fontSize: '12px',
              color: '#888'
            }}>
              尚未加入任何儲存庫<br/>
              請貼上路徑或點擊瀏覽
            </div>
          ) : (
            savedRepos.map(repo => (
              <div
                key={repo.path}
                onClick={() => handleSelectSavedRepo(repo.path)}
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid #333',
                  cursor: 'pointer',
                  backgroundColor: repo.path === repoPath ? '#094771' : 'transparent',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (repo.path !== repoPath) {
                    e.currentTarget.style.backgroundColor = '#2a2d2e'
                  }
                }}
                onMouseLeave={(e) => {
                  if (repo.path !== repoPath) {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '4px'
                }}>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: 500
                  }}>
                    {repo.name}
                  </span>
                  <button
                    onClick={(e) => handleRemoveSavedRepo(repo.path, e)}
                    style={{
                      padding: '0 4px',
                      fontSize: '14px',
                      backgroundColor: 'transparent',
                      color: '#888',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    ×
                  </button>
                </div>
                <div style={{
                  fontSize: '10px',
                  color: '#888',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}
                title={repo.path}
                >
                  {repo.path}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Panel - Git Details */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* Header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #333',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: '#1e1e1e'
        }}>
          <div style={{ 
            fontSize: '12px',
            color: '#888',
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            marginRight: '12px'
          }}>
            {repoPath || '未選擇儲存庫'}
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={loadGitData}
              disabled={loading || !repoPath}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                backgroundColor: '#3a3a3a',
                color: '#e0e0e0',
                border: '1px solid #555',
                borderRadius: '3px',
                cursor: (loading || !repoPath) ? 'not-allowed' : 'pointer',
                opacity: (loading || !repoPath) ? 0.5 : 1
              }}
            >
              {loading ? '更新中...' : '🔄 重新整理'}
            </button>
            {/* 分支选择器 */}
            {availableBranches.length > 1 && (
              <select
                value={selectedBranch}
                onChange={(e) => handleSwitchBranch(e.target.value)}
                disabled={loading}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  backgroundColor: '#3a3a3a',
                  color: '#e0e0e0',
                  border: '1px solid #555',
                  borderRadius: '3px',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.5 : 1
                }}
              >
                {availableBranches.map(branch => (
                  <option key={branch.name} value={branch.name}>
                    🌿 {branch.name}
                  </option>
                ))}
              </select>
            )}
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
            {selectedCommit ? (
              // 显示提交详情
              <div>
                <button
                  onClick={() => { setSelectedCommit(null); setCommitDetails('') }}
                  style={{
                    marginBottom: '12px',
                    padding: '6px 12px',
                    fontSize: '12px',
                    backgroundColor: '#3a3a3a',
                    color: '#e0e0e0',
                    border: '1px solid #555',
                    borderRadius: '3px',
                    cursor: 'pointer'
                  }}
                >
                  ← 返回提交列表
                </button>
                <div style={{
                  backgroundColor: '#2a2a2a',
                  padding: '12px',
                  borderRadius: '4px',
                  border: '1px solid #3a3a3a',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 'calc(100vh - 300px)',
                  overflow: 'auto'
                }}>
                  {commitDetails || '載入中...'}
                </div>
              </div>
            ) : (
              // 显示提交列表
              <div>
                {gitLogs.map((log, idx) => {
                  const isUrl = repoPath.startsWith('http://') || repoPath.startsWith('https://') || repoPath.startsWith('git@')
                  const isClickable = log.hash && !log.hash.startsWith('remote-')
                  
                  return (
                    <div
                      key={log.hash || `log-${idx}`}
                      onClick={() => isClickable && handleViewCommit(log.hash)}
                      style={{
                        padding: '10px 12px',
                        backgroundColor: '#2a2a2a',
                        borderRadius: '4px',
                        border: '1px solid #3a3a3a',
                        cursor: isClickable ? 'pointer' : 'default',
                        opacity: isClickable ? 1 : 0.8,
                        transition: 'background-color 0.2s'
                      }}
                      onMouseEnter={e => isClickable && (e.currentTarget.style.backgroundColor = '#3a3a3a')}
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
                  )
                })}
              </div>
            )}
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
    </div>
  )
}
