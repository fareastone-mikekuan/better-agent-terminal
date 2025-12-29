import { useState, useEffect, useRef } from 'react'
import { settingsStore } from '../stores/settings-store'
import { workspaceStore } from '../stores/workspace-store'

interface FileExplorerPanelProps {
  isVisible: boolean
  onClose: () => void
  height?: number
  width?: number
  isFloating?: boolean
  onToggleFloat?: () => void
  onAnalyzeFile?: (fileName: string, content: string) => void
  workspaceId?: string | null  // 用於工作區獨立模式
}

interface RemoteConnection {
  id: string
  name: string
  type: 'ftp' | 'sftp' | 'local'
  host: string
  port: number
  username: string
  password?: string
  basePath: string
  description?: string
  passive?: boolean
  transferMode?: 'binary' | 'ascii'
  isFavorite?: boolean
  lastConnected?: string
}

interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  size?: number
  modifiedTime?: string
}

export function FileExplorerPanel({ 
  isVisible, 
  onClose, 
  width = 400,
  isFloating = false,
  onToggleFloat,
  onAnalyzeFile,
  workspaceId
}: Readonly<FileExplorerPanelProps>) {
  // 根據設定決定使用共用或獨立的 localStorage 鍵
  const [settings, setSettings] = useState(() => settingsStore.getSettings())
  const isShared = settings.sharedPanels?.fileExplorer !== false
  const connectionsStorageKey = 'file-explorer-connections'  // 連接列表永遠共用
  const stateStorageKey = isShared ? 'file-explorer-state' : `file-explorer-state-${workspaceId || 'default'}`  // 連接狀態按設定
  
  // 浮動模式的位置和大小（只在浮動時使用）
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('file-explorer-position')
    return saved ? JSON.parse(saved) : { x: 100, y: 100 }
  })
  
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('file-explorer-size')
    return saved ? JSON.parse(saved) : { width: 500, height: 700 }
  })

  const [zIndex, setZIndex] = useState(1000)
  
  // 訂閱設定變更
  useEffect(() => {
    const unsubscribe = settingsStore.subscribe(() => {
      setSettings(settingsStore.getSettings())
    })
    return unsubscribe
  }, [])
  
  const [connections, setConnections] = useState<RemoteConnection[]>([])  // 連接列表共用
  
  const [activeConnection, setActiveConnection] = useState<RemoteConnection | null>(null)
  const [currentPath, setCurrentPath] = useState<string>('/')
  const [files, setFiles] = useState<FileItem[]>([])
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingConnection, setEditingConnection] = useState<RemoteConnection | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [viewingFile, setViewingFile] = useState<string | null>(null)
  const [connectionLogs, setConnectionLogs] = useState<string[]>([])
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null)
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'time'>('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  
  // New connection form state
  const [newConnection, setNewConnection] = useState<Partial<RemoteConnection>>({
    type: 'sftp',
    port: 22,
    basePath: '/',
    passive: true,
    transferMode: 'binary'
  })

  const isLoadingConnections = useRef(false)
  const isLoadingState = useRef(false)
  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const isResizing = useRef(false)
  const resizeStart = useRef({ x: 0, y: 0, width: 0, height: 0 })

  // Handle drag start
  const handleDragStart = (e: React.MouseEvent) => {
    if (!isFloating) return
    setZIndex(1001) // 置頂
    isDragging.current = true
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y
    }
  }

  // Handle drag move
  useEffect(() => {
    const handleDragMove = (e: MouseEvent) => {
      if (isDragging.current) {
        setPosition({
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y
        })
      }
      if (isResizing.current) {
        const deltaX = e.clientX - resizeStart.current.x
        const deltaY = e.clientY - resizeStart.current.y
        setSize({
          width: Math.max(400, resizeStart.current.width + deltaX),
          height: Math.max(500, resizeStart.current.height + deltaY)
        })
      }
    }

    const handleDragEnd = () => {
      isDragging.current = false
      isResizing.current = false
    }

    if (isFloating) {
      document.addEventListener('mousemove', handleDragMove)
      document.addEventListener('mouseup', handleDragEnd)
      return () => {
        document.removeEventListener('mousemove', handleDragMove)
        document.removeEventListener('mouseup', handleDragEnd)
      }
    }
  }, [isFloating])

  // Handle resize start
  const handleResizeStart = (e: React.MouseEvent) => {
    e.stopPropagation()
    isResizing.current = true
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height
    }
  }

  useEffect(() => {
    localStorage.setItem('file-explorer-position', JSON.stringify(position))
  }, [position])

  useEffect(() => {
    localStorage.setItem('file-explorer-size', JSON.stringify(size))
  }, [size])

  // 載入共用的連接列表（只在首次載入）
  useEffect(() => {
    console.log('[FileExplorer] Loading shared connections')
    isLoadingConnections.current = true
    const saved = localStorage.getItem(connectionsStorageKey)
    const loadedConnections = saved ? JSON.parse(saved) : []
    console.log('[FileExplorer] Loaded', loadedConnections.length, 'shared connections')
    setConnections(loadedConnections)
    setTimeout(() => {
      isLoadingConnections.current = false
    }, 0)
  }, [])

  // 保存共用的連接列表
  useEffect(() => {
    if (!isLoadingConnections.current) {
      console.log('[FileExplorer] Saving', connections.length, 'shared connections')
      localStorage.setItem(connectionsStorageKey, JSON.stringify(connections))
    }
  }, [connections])

  // 載入工作區的連接狀態（activeConnection, currentPath, files）
  useEffect(() => {
    console.log('[FileExplorer] Loading state for:', stateStorageKey, 'workspaceId:', workspaceId)
    isLoadingState.current = true
    const saved = localStorage.getItem(stateStorageKey)
    if (saved) {
      try {
        const state = JSON.parse(saved)
        console.log('[FileExplorer] Loaded state:', state)
        setActiveConnection(state.activeConnection || null)
        setCurrentPath(state.currentPath || '/')
        setFiles(state.files || [])
      } catch (e) {
        console.error('[FileExplorer] Failed to load state:', e)
      }
    } else {
      // 新工作區，重置狀態
      setActiveConnection(null)
      setCurrentPath('/')
      setFiles([])
    }
    setTimeout(() => {
      isLoadingState.current = false
    }, 0)
  }, [stateStorageKey, workspaceId])

  // 保存工作區的連接狀態
  useEffect(() => {
    if (!isLoadingState.current && workspaceId) {
      const state = {
        activeConnection,
        currentPath,
        files
      }
      console.log('[FileExplorer] Saving state to:', stateStorageKey, state)
      localStorage.setItem(stateStorageKey, JSON.stringify(state))
    }
  }, [activeConnection, currentPath, files, stateStorageKey, workspaceId])

  const handleAddConnection = () => {
    if (!newConnection.name) {
      setError('請填寫名稱')
      return
    }
    
    if (newConnection.type !== 'local' && !newConnection.host) {
      setError('請填寫主機')
      return
    }
    
    if (!newConnection.basePath) {
      setError('請填寫路徑')
      return
    }

    if (editingConnection) {
      // 編輯現有連接
      setConnections(connections.map(c => 
        c.id === editingConnection.id 
          ? {
              ...c,
              name: newConnection.name!,
              type: newConnection.type || 'sftp',
              host: newConnection.host!,
              port: newConnection.port || 22,
              username: newConnection.username || '',
              password: newConnection.password,
              basePath: newConnection.basePath || '/',
              description: newConnection.description
            }
          : c
      ))
      setEditingConnection(null)
    } else {
      // 新增連接
      const connection: RemoteConnection = {
        id: Date.now().toString(),
        name: newConnection.name,
        type: newConnection.type || 'sftp',
        host: newConnection.host,
        port: newConnection.port || 22,
        username: newConnection.username || '',
        password: newConnection.password,
        basePath: newConnection.basePath || '/',
        description: newConnection.description
      }
      setConnections([...connections, connection])
    }

    setNewConnection({ type: 'sftp', port: 22, basePath: '/' })
    setShowAddForm(false)
    setError(null)
  }

  const handleEditConnection = (connection: RemoteConnection) => {
    setEditingConnection(connection)
    setNewConnection({
      name: connection.name,
      type: connection.type,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      password: connection.password,
      basePath: connection.basePath,
      description: connection.description,
      passive: connection.passive ?? true,
      transferMode: connection.transferMode ?? 'binary',
      isFavorite: connection.isFavorite
    })
    setShowAddForm(true)
  }

  const handleCancelEdit = () => {
    setEditingConnection(null)
    setNewConnection({ type: 'sftp', port: 22, basePath: '/', passive: true, transferMode: 'binary' })
    setShowAddForm(false)
    setError(null)
  }

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('zh-TW', { hour12: false })
    setConnectionLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }

  const handleConnect = async (connection: RemoteConnection) => {
    setIsConnecting(true)
    setError(null)
    setConnectionLogs([])
    setActiveConnection(connection)
    setCurrentPath(connection.basePath)
    
    try {
      addLog(`正在連接到 ${connection.type.toUpperCase()} 伺服器...`)
      addLog(`主機: ${connection.host}:${connection.port}`)
      if (connection.type === 'ftp') {
        addLog(`傳輸模式: ${connection.transferMode?.toUpperCase() || 'BINARY'}`)
        addLog(`被動模式: ${connection.passive ? '啟用' : '停用'}`)
      }
      
      // 連接到 FTP/SFTP 伺服器
      const result = await window.electronAPI.ftp.connect(connection)
      
      if (!result.success) {
        addLog(`❌ 連接失敗: ${result.error}`)
        throw new Error(result.error || '連接失敗')
      }
      
      addLog(`✅ 連接成功`)
      addLog(`正在讀取目錄: ${connection.basePath}`)
      
      // 列出初始目錄
      const listResult = await window.electronAPI.ftp.list(connection.basePath)
      
      if (!listResult.success) {
        addLog(`❌ 讀取目錄失敗: ${listResult.error}`)
        throw new Error(listResult.error || '讀取目錄失敗')
      }
      
      addLog(`✅ 找到 ${listResult.files?.length || 0} 個項目`)
      
      // 添加上層目錄
      const filesWithParent = [
        { name: '..', path: '..', isDirectory: true },
        ...(listResult.files || [])
      ]
      
      setFiles(filesWithParent)
      setIsConnecting(false)
      
      // 更新最近連接時間
      setConnections(prev => prev.map(c => 
        c.id === connection.id 
          ? { ...c, lastConnected: new Date().toISOString() }
          : c
      ))
    } catch (err) {
      setError(`連接失敗: ${(err as Error).message}`)
      setIsConnecting(false)
      setActiveConnection(null)
    }
  }

  const handleDisconnect = async () => {
    try {
      addLog('正在斷開連接...')
      await window.electronAPI.ftp.disconnect()
      addLog('✅ 已斷開連接')
    } catch (err) {
      console.error('斷開連接失敗:', err)
      addLog(`❌ 斷開連接失敗: ${(err as Error).message}`)
    }
    setActiveConnection(null)
    setCurrentPath('/')
    setFiles([])
    setConnectionLogs([])
    setError(null)
  }

  const handleToggleFavorite = (id: string) => {
    setConnections(connections.map(c => 
      c.id === id ? { ...c, isFavorite: !c.isFavorite } : c
    ))
  }

  const handleDeleteConnection = (id: string) => {
    if (confirm('確定要刪除此連接？')) {
      setConnections(connections.filter(c => c.id !== id))
      if (activeConnection?.id === id) {
        handleDisconnect()
      }
    }
  }

  const handleNavigate = async (path: string) => {
    try {
      let newPath = path
      if (path === '..') {
        // 返回上一級
        if (activeConnection?.type === 'local') {
          // Windows 路徑處理
          const parts = currentPath.split('\\').filter(p => p)
          if (parts.length > 1) {
            parts.pop()
            newPath = parts.join('\\')
          } else {
            // 已經在根目錄
            setError('已經在根目錄')
            return
          }
        } else {
          // Unix 路徑處理 (FTP/SFTP)
          const parts = currentPath.split('/').filter(p => p)
          if (parts.length > 0) {
            parts.pop()
            newPath = '/' + parts.join('/')
          } else {
            // 已經在根目錄
            setError('已經在根目錄')
            return
          }
        }
      }
      
      setCurrentPath(newPath)
      
      // 載入新路徑的文件列表
      const listResult = await window.electronAPI.ftp.list(newPath)
      
      if (!listResult.success) {
        throw new Error(listResult.error || '讀取目錄失敗')
      }
      
      // 添加上層目錄（非根目錄時）
      const isRoot = activeConnection?.type === 'local' 
        ? (newPath.split('\\').filter(p => p).length <= 1)
        : (newPath === '/')
      
      const filesWithParent = isRoot 
        ? (listResult.files || [])
        : [
            { name: '..', path: '..', isDirectory: true },
            ...(listResult.files || [])
          ]
      
      setFiles(filesWithParent)
      setError(null)
    } catch (err) {
      setError(`讀取目錄失敗: ${(err as Error).message}`)
    }
  }

  const handleOpenFile = async (file: FileItem) => {
    if (file.isDirectory) {
      handleNavigate(file.path)
    } else {
      setSelectedFile(file)
    }
  }

  const handleViewFile = async (file: FileItem) => {
    try {
      setError('正在讀取文件...')
      setViewingFile(file.name)
      const readResult = await window.electronAPI.ftp.read(file.path)
      
      if (!readResult.success) {
        throw new Error(readResult.error || '讀取文件失敗')
      }
      
      setFileContent(readResult.content)
      setError(null)
    } catch (err) {
      setError(`讀取文件失敗: ${(err as Error).message}`)
      setViewingFile(null)
    }
  }

  const handleAnalyzeWithAI = async (file: FileItem) => {
    if (!onAnalyzeFile) {
      setError('ℹ️ Copilot 功能未啟用')
      return
    }
    
    try {
      setError('🤖 正在讀取檔案並傳送給 AI...')
      const readResult = await window.electronAPI.ftp.read(file.path)
      
      if (!readResult.success) {
        throw new Error(readResult.error || '讀取檔案失敗')
      }
      
      // 傳送給 Copilot 分析
      onAnalyzeFile(file.name, readResult.content)
      setError('✅ 已傳送給 Copilot 分析')
      setTimeout(() => setError(null), 2000)
    } catch (err) {
      setError(`AI 分析失敗: ${(err as Error).message}`)
    }
  }

  const handleDownloadFile = async (file: FileItem) => {
    try {
      setError('正在下載文件...')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const localPath = `${file.name}_${timestamp}`
      
      const result = await window.electronAPI.ftp.download(file.path, localPath)
      
      if (!result.success) {
        throw new Error(result.error || '下載失敗')
      }
      
      setError(`✅ 文件已下載: ${localPath}`)
      setTimeout(() => setError(null), 3000)
    } catch (err) {
      setError(`下載失敗: ${(err as Error).message}`)
    }
  }

  const handleRefresh = async () => {
    if (!activeConnection) return
    
    try {
      const listResult = await window.electronAPI.ftp.list(currentPath)
      
      if (!listResult.success) {
        throw new Error(listResult.error || '刷新失敗')
      }
      
      const filesWithParent = [
        { name: '..', path: '..', isDirectory: true },
        ...(listResult.files || [])
      ]
      
      setFiles(filesWithParent)
      setError('✅ 已刷新')
      setTimeout(() => setError(null), 2000)
    } catch (err) {
      setError(`刷新失敗: ${(err as Error).message}`)
    }
  }

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  const sortFiles = (fileList: FileItem[]): FileItem[] => {
    const sorted = [...fileList]
    const parentDir = sorted.find(f => f.name === '..')
    const others = sorted.filter(f => f.name !== '..')
    
    others.sort((a, b) => {
      // 目錄優先
      if (a.isDirectory && !b.isDirectory) return -1
      if (!a.isDirectory && b.isDirectory) return 1
      
      let comparison = 0
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'zh-TW')
          break
        case 'size':
          comparison = (a.size || 0) - (b.size || 0)
          break
        case 'time':
          const timeA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0
          const timeB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0
          comparison = timeB - timeA  // 預設最新在前
          break
      }
      
      return sortOrder === 'asc' ? comparison : -comparison
    })
    
    return parentDir ? [parentDir, ...others] : others
  }

  const formatDateTime = (dateString?: string): string => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    const month = (date.getMonth() + 1).toString().padStart(2, '0')
    const day = date.getDate().toString().padStart(2, '0')
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${month}/${day} ${hours}:${minutes}`
  }

  if (!isVisible) return null

  // Get workspace name for display
  const state = workspaceStore.getState()
  const currentWorkspace = state.workspaces.find(w => w.id === workspaceId)
  const workspaceName = currentWorkspace?.alias || currentWorkspace?.name || '未知工作區'
  const modeLabel = isShared ? '🌐 共用' : `🔒 ${workspaceName}`

  const panelClass = isFloating ? 'file-explorer-panel floating' : 'file-explorer-panel docked'
  const panelStyle = isFloating 
    ? { 
        position: 'fixed' as const,
        left: position.x, 
        top: position.y, 
        width: size.width, 
        height: size.height, 
        zIndex,
        backgroundColor: '#1f1d1a',
        border: '1px solid #3a3836',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden'
      }
    : { 
        width: isFloating ? '100%' : width,
        height: isFloating ? '100%' : '100%',
        backgroundColor: '#1f1d1a',
        borderRight: isFloating ? 'none' : '1px solid #3a3836',
        display: 'flex',
        flexDirection: 'column' as const,
        overflow: 'hidden'
      }

  return (
    <aside className={panelClass} style={panelStyle}>
      {/* Header */}
      <div 
        style={{
          padding: '12px 16px',
          backgroundColor: '#2a2826',
          borderBottom: '1px solid #3a3836',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: isFloating ? 'move' : 'default'
        }}
        onMouseDown={isFloating ? handleDragStart : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h3 style={{ margin: 0, color: '#dfdbc3', fontSize: '14px', fontWeight: 'bold' }}>
            📁 FILE
          </h3>
          <span style={{ 
            fontSize: '10px', 
            color: isShared ? '#7bbda4' : '#f59e0b',
            backgroundColor: isShared ? '#2d4a2d' : '#3d2f1f',
            padding: '2px 6px',
            borderRadius: '8px',
            fontWeight: 'bold'
          }}>
            {modeLabel}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {onToggleFloat && (
            <button 
              onClick={onToggleFloat}
              style={{
                background: 'none',
                border: '1px solid #3a3836',
                color: '#dfdbc3',
                cursor: 'pointer',
                fontSize: '14px',
                padding: '2px 6px',
                borderRadius: '3px'
              }}
              title={isFloating ? '固定面板' : '浮動視窗'}
            >
              {isFloating ? '📌' : '🔗'}
            </button>
          )}
          <button onClick={onClose} style={{
            background: 'none',
            border: 'none',
            color: '#dfdbc3',
            cursor: 'pointer',
            fontSize: '20px',
            padding: '0 4px'
          }}>×</button>
        </div>
      </div>

      {/* Connection List */}
      {!activeConnection && (
        <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
          <div style={{ marginBottom: '12px' }}>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              style={{
                width: '100%',
                padding: '10px',
                backgroundColor: '#7bbda4',
                color: '#1f1d1a',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '13px'
              }}
            >
              ➕ 新增連接
            </button>
          </div>

          {/* Add Connection Form */}
          {showAddForm && (
            <div style={{
              padding: '12px',
              backgroundColor: '#2a2826',
              borderRadius: '6px',
              marginBottom: '12px',
              border: '1px solid #3a3836'
            }}>
              <h4 style={{ color: '#dfdbc3', fontSize: '13px', marginBottom: '10px' }}>
                {editingConnection ? '✏️ 編輯連接' : '➕ 新增連接'}
              </h4>

              {!editingConnection && (
                <div style={{ 
                  padding: '8px', 
                  backgroundColor: '#3a3836', 
                  borderRadius: '4px', 
                  marginBottom: '12px',
                  fontSize: '11px',
                  color: '#dfdbc3'
                }}>
                  💡 <strong>快速連線提示：</strong>
                  <ul style={{ margin: '4px 0', paddingLeft: '20px' }}>
                    <li><strong>SFTP/FTP</strong>: 遠端伺服器日誌（需填寫主機、帳密）</li>
                    <li><strong>本地路徑</strong>: 快速訪問本機資料夾（如 C:\logs）</li>
                    <li>勾選「⭐加入快速連線」可自動排在最前方</li>
                    <li>帳密會安全保存，下次免輸入</li>
                  </ul>
                </div>
              )}
              
              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>類型</label>
                <select
                  value={newConnection.type}
                  onChange={e => setNewConnection({ ...newConnection, type: e.target.value as any })}
                  style={{
                    width: '100%',
                    padding: '6px',
                    backgroundColor: '#1f1d1a',
                    color: '#dfdbc3',
                    border: '1px solid #3a3836',
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}
                >
                  <option value="sftp">SFTP (SSH)</option>
                  <option value="ftp">FTP</option>
                  <option value="local">本地路徑</option>
                </select>
              </div>

              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>名稱 *</label>
                <input
                  type="text"
                  placeholder="如：生產環境 Billing LOG"
                  value={newConnection.name || ''}
                  onChange={e => setNewConnection({ ...newConnection, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '6px',
                    backgroundColor: '#1f1d1a',
                    color: '#dfdbc3',
                    border: '1px solid #3a3836',
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}
                />
              </div>

              {newConnection.type !== 'local' && (
                <>
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>主機 *</label>
                    <input
                      type="text"
                      placeholder="192.168.1.100"
                      value={newConnection.host || ''}
                      onChange={e => setNewConnection({ ...newConnection, host: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px',
                        backgroundColor: '#1f1d1a',
                        color: '#dfdbc3',
                        border: '1px solid #3a3836',
                        borderRadius: '3px',
                        fontSize: '12px'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>Port</label>
                    <input
                      type="number"
                      placeholder="22"
                      value={newConnection.port || ''}
                      onChange={e => setNewConnection({ ...newConnection, port: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        padding: '6px',
                        backgroundColor: '#1f1d1a',
                        color: '#dfdbc3',
                        border: '1px solid #3a3836',
                        borderRadius: '3px',
                        fontSize: '12px'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>使用者名稱</label>
                    <input
                      type="text"
                      value={newConnection.username || ''}
                      onChange={e => setNewConnection({ ...newConnection, username: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px',
                        backgroundColor: '#1f1d1a',
                        color: '#dfdbc3',
                        border: '1px solid #3a3836',
                        borderRadius: '3px',
                        fontSize: '12px'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>密碼 (選填)</label>
                    <input
                      type="password"
                      value={newConnection.password || ''}
                      onChange={e => setNewConnection({ ...newConnection, password: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '6px',
                        backgroundColor: '#1f1d1a',
                        color: '#dfdbc3',
                        border: '1px solid #3a3836',
                        borderRadius: '3px',
                        fontSize: '12px'
                      }}
                    />
                  </div>
                </>
              )}

              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>
                  {newConnection.type === 'local' ? '本地路徑 *' : '預設路徑'}
                </label>
                <input
                  type="text"
                  placeholder={newConnection.type === 'local' ? 'C:\\logs\\billing' : '/app/logs'}
                  value={newConnection.basePath || ''}
                  onChange={e => setNewConnection({ ...newConnection, basePath: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '6px',
                    backgroundColor: '#1f1d1a',
                    color: '#dfdbc3',
                    border: '1px solid #3a3836',
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>說明</label>
                <input
                  type="text"
                  placeholder="如：每日出帳JOB日誌"
                  value={newConnection.description || ''}
                  onChange={e => setNewConnection({ ...newConnection, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '6px',
                    backgroundColor: '#1f1d1a',
                    color: '#dfdbc3',
                    border: '1px solid #3a3836',
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}
                />
              </div>

              {newConnection.type === 'ftp' && (
                <>
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: '#888', marginBottom: '4px' }}>傳輸模式</label>
                    <select
                      value={newConnection.transferMode || 'binary'}
                      onChange={e => setNewConnection({ ...newConnection, transferMode: e.target.value as 'binary' | 'ascii' })}
                      style={{
                        width: '100%',
                        padding: '6px',
                        backgroundColor: '#1f1d1a',
                        color: '#dfdbc3',
                        border: '1px solid #3a3836',
                        borderRadius: '3px',
                        fontSize: '12px'
                      }}
                    >
                      <option value="binary">Binary (二進制，推薦)</option>
                      <option value="ascii">ASCII (文字檔)</option>
                    </select>
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#dfdbc3', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={newConnection.passive ?? true}
                        onChange={e => setNewConnection({ ...newConnection, passive: e.target.checked })}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>啟用被動模式 (Passive Mode，推薦)</span>
                    </label>
                    <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', marginLeft: '24px' }}>
                      防火牆後方建議啟用
                    </div>
                  </div>
                </>
              )}

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#dfdbc3', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={newConnection.isFavorite ?? false}
                    onChange={e => setNewConnection({ ...newConnection, isFavorite: e.target.checked })}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>⭐ 加入快速連線（收藏）</span>
                </label>
                <div style={{ fontSize: '11px', color: '#888', marginTop: '4px', marginLeft: '24px' }}>
                  收藏的連接會排在最前方，方便快速存取
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={handleAddConnection}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#7bbda4',
                    color: '#1f1d1a',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    fontSize: '12px'
                  }}
                >
                  ✓ {editingConnection ? '更新' : '儲存'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: '#555',
                    color: '#dfdbc3',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  ✕ 取消
                </button>
              </div>
            </div>
          )}

          {/* Connection List */}
          <div style={{ fontSize: '12px', color: '#888', marginBottom: '8px', fontWeight: 'bold' }}>
            已儲存的連接 ({connections.length})
          </div>
          {connections
            .sort((a, b) => {
              // 收藏優先
              if (a.isFavorite && !b.isFavorite) return -1
              if (!a.isFavorite && b.isFavorite) return 1
              // 最近使用優先
              if (a.lastConnected && b.lastConnected) {
                return new Date(b.lastConnected).getTime() - new Date(a.lastConnected).getTime()
              }
              if (a.lastConnected) return -1
              if (b.lastConnected) return 1
              return 0
            })
            .map(conn => (
            <div
              key={conn.id}
              style={{
                padding: '12px',
                backgroundColor: '#2a2826',
                borderRadius: '6px',
                marginBottom: '8px',
                border: '1px solid #3a3836'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#dfdbc3', fontSize: '13px', fontWeight: 'bold', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {conn.type === 'sftp' ? '🔐' : conn.type === 'ftp' ? '📡' : '📂'} {conn.name}
                    {conn.isFavorite && <span style={{ color: '#ffd700' }}>⭐</span>}
                  </div>
                  <div style={{ color: '#888', fontSize: '11px', marginBottom: '2px' }}>
                    {conn.type === 'local' ? conn.basePath : `${conn.host}:${conn.port} → ${conn.basePath}`}
                  </div>
                  {conn.description && (
                    <div style={{ color: '#888', fontSize: '11px', fontStyle: 'italic' }}>
                      {conn.description}
                    </div>
                  )}
                  {conn.lastConnected && (
                    <div style={{ color: '#7bbda4', fontSize: '10px', marginTop: '2px' }}>
                      最近連接: {new Date(conn.lastConnected).toLocaleString('zh-TW', { 
                        month: '2-digit', 
                        day: '2-digit', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => handleToggleFavorite(conn.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: conn.isFavorite ? '#ffd700' : '#555',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '0 4px'
                    }}
                    title={conn.isFavorite ? '取消收藏' : '加入收藏'}
                  >
                    {conn.isFavorite ? '⭐' : '☆'}
                  </button>
                  <button
                    onClick={() => handleEditConnection(conn)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#7bbda4',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '0 4px'
                    }}
                    title="編輯"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeleteConnection(conn.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#cb6077',
                      cursor: 'pointer',
                      fontSize: '16px',
                      padding: '0 4px'
                    }}
                    title="刪除"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <button
                onClick={() => handleConnect(conn)}
                disabled={isConnecting}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: isConnecting ? '#555' : '#3a7a5f',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: isConnecting ? 'not-allowed' : 'pointer',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
              >
                {isConnecting ? '連接中...' : '🔗 連接'}
              </button>
            </div>
          ))}

          {connections.length === 0 && !showAddForm && (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: '#888',
              fontSize: '12px'
            }}>
              尚未新增任何連接<br/>
              點擊上方按鈕開始新增
            </div>
          )}
        </div>
      )}

      {/* File Browser */}
      {activeConnection && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Connection Info Bar */}
          <div style={{
            padding: '8px 12px',
            backgroundColor: '#2d4a2d',
            borderBottom: '1px solid #3a3836',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ fontSize: '12px', color: '#7bbda4' }}>
              ✓ 已連接: {activeConnection.name}
            </div>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={handleRefresh}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}
                title="刷新"
              >
                🔄
              </button>
              <button
                onClick={handleDisconnect}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#cb6077',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: 'bold'
                }}
              >
                斷開
              </button>
            </div>
          </div>

          {/* Path Bar */}
          <div style={{
            padding: '8px 12px',
            backgroundColor: '#1f1d1a',
            borderBottom: '1px solid #3a3836',
            fontSize: '12px',
            color: '#dfdbc3',
            fontFamily: 'monospace'
          }}>
            📂 {currentPath}
          </div>

          {/* Connection Logs */}
          {connectionLogs.length > 0 && (
            <div style={{
              padding: '8px 12px',
              backgroundColor: '#0a0a0a',
              borderBottom: '1px solid #3a3836',
              maxHeight: '120px',
              overflow: 'auto',
              fontSize: '11px',
              fontFamily: 'monospace'
            }}>
              <div style={{ color: '#888', marginBottom: '4px', fontWeight: 'bold' }}>📋 連接日誌</div>
              {connectionLogs.map((log, idx) => (
                <div key={idx} style={{ color: log.includes('❌') ? '#cb6077' : log.includes('✅') ? '#7bbda4' : '#dfdbc3', marginBottom: '2px' }}>
                  {log}
                </div>
              ))}
            </div>
          )}

          {/* Sort Toolbar */}
          <div style={{
            padding: '8px 12px',
            backgroundColor: '#2a2826',
            borderBottom: '1px solid #3a3836',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px'
          }}>
            <div style={{ fontSize: '11px', color: '#888' }}>
              排序方式：
            </div>
            <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
              <button
                onClick={() => setSortBy('name')}
                style={{
                  padding: '4px 8px',
                  backgroundColor: sortBy === 'name' ? '#7bbda4' : '#3a3836',
                  color: sortBy === 'name' ? '#1f1d1a' : '#dfdbc3',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: sortBy === 'name' ? 'bold' : 'normal'
                }}
              >
                🔤 名稱
              </button>
              <button
                onClick={() => setSortBy('size')}
                style={{
                  padding: '4px 8px',
                  backgroundColor: sortBy === 'size' ? '#7bbda4' : '#3a3836',
                  color: sortBy === 'size' ? '#1f1d1a' : '#dfdbc3',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: sortBy === 'size' ? 'bold' : 'normal'
                }}
              >
                📊 大小
              </button>
              <button
                onClick={() => setSortBy('time')}
                style={{
                  padding: '4px 8px',
                  backgroundColor: sortBy === 'time' ? '#7bbda4' : '#3a3836',
                  color: sortBy === 'time' ? '#1f1d1a' : '#dfdbc3',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: sortBy === 'time' ? 'bold' : 'normal'
                }}
              >
                🕓 時間
              </button>
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '11px'
                }}
                title={sortOrder === 'asc' ? '正序' : '倒序'}
              >
                {sortOrder === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>

          {/* File List */}
          <div style={{ 
            flex: '1 1 auto',
            overflowY: 'scroll',
            padding: '8px',
            height: 0
          }}>
            {sortFiles(files).map((file, idx) => {
              const isSelected = selectedFile?.path === file.path
              return (
                <div
                  key={idx}
                  onClick={() => handleOpenFile(file)}
                  onDoubleClick={() => {
                    if (file.isDirectory) {
                      handleNavigate(file.path)
                    } else {
                      handleViewFile(file)
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: isSelected ? '#3a5a3a' : '#2a2826',
                    borderRadius: '4px',
                    marginBottom: '4px',
                    fontSize: '12px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    transition: 'background-color 0.2s',
                    cursor: 'pointer',
                    border: isSelected ? '1px solid #7bbda4' : '1px solid transparent'
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#3a3836'
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = '#2a2826'
                  }}
                >
                  <div 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      flex: 1,
                      minWidth: 0
                    }}
                  >
                    <span>{file.isDirectory ? '📁' : '📄'}</span>
                    <span style={{ color: '#dfdbc3', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                    {file.isDirectory && <span style={{ color: '#888', fontSize: '10px' }}>(雙擊開啟)</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    {file.modifiedTime && file.name !== '..' && (
                      <span style={{ color: '#888', fontSize: '10px', minWidth: '80px', textAlign: 'right' }}>
                        {formatDateTime(file.modifiedTime)}
                      </span>
                    )}
                    {file.size !== undefined && file.name !== '..' && (
                      <span style={{ color: '#888', fontSize: '11px', minWidth: '70px', textAlign: 'right' }}>
                        {formatFileSize(file.size)}
                      </span>
                    )}
                    {!file.isDirectory && file.name !== '..' && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleAnalyzeWithAI(file)
                          }}
                          style={{
                            padding: '2px 6px',
                            backgroundColor: '#7bbda4',
                            color: '#1f1d1a',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '10px',
                            fontWeight: 'bold'
                          }}
                          title="AI分析"
                        >
                          🤖 AI
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleViewFile(file)
                          }}
                          style={{
                            padding: '2px 6px',
                            backgroundColor: '#555',
                            color: '#dfdbc3',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '10px'
                          }}
                          title="查看"
                        >
                          查看
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownloadFile(file)
                          }}
                          style={{
                            padding: '2px 6px',
                            backgroundColor: '#555',
                            color: '#dfdbc3',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '10px'
                          }}
                          title="下載"
                        >
                          下載
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* File Viewer Modal */}
      {viewingFile && fileContent !== null && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: '#1f1d1a',
            borderRadius: '8px',
            border: '1px solid #3a3836',
            maxWidth: '90%',
            maxHeight: '90%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '12px 16px',
              backgroundColor: '#2a2826',
              borderBottom: '1px solid #3a3836',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ color: '#dfdbc3', fontSize: '13px', fontWeight: 'bold' }}>
                📄 {viewingFile}
              </div>
              <button
                onClick={() => {
                  setViewingFile(null)
                  setFileContent(null)
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#dfdbc3',
                  cursor: 'pointer',
                  fontSize: '20px',
                  padding: '0 4px'
                }}
              >
                ×
              </button>
            </div>
            {/* Modal Content */}
            <div style={{
              padding: '16px',
              overflow: 'auto',
              flex: 1,
              backgroundColor: '#0a0a0a'
            }}>
              <pre style={{
                color: '#dfdbc3',
                fontSize: '12px',
                fontFamily: 'Consolas, Monaco, monospace',
                margin: 0,
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word'
              }}>
                {fileContent}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '12px',
          backgroundColor: '#4a3d2d',
          borderTop: '1px solid #3a3836',
          color: '#dfdbc3',
          fontSize: '12px'
        }}>
          {error}
        </div>
      )}
      
      {/* Resize Handle for floating mode */}
      {isFloating && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: '20px',
            height: '20px',
            cursor: 'nwse-resize',
            background: 'linear-gradient(135deg, transparent 50%, #3a3836 50%)',
            borderBottomRightRadius: '6px'
          }}
          title="調整大小"
        />
      )}
    </aside>
  )
}
