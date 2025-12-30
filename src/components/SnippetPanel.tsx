import { useState, useEffect, useCallback, useRef } from 'react'

// Snippet interface (matches backend)
type SnippetFormat = 'plaintext' | 'markdown'
type TabType = 'snippets' | 'community' | 'todo'

interface Snippet {
    id: number
    title: string
    content: string
    format: SnippetFormat
    category?: string
    tags?: string
    isFavorite: boolean
    createdAt: number
    updatedAt: number
}

interface WikiPage {
    name: string
    title: string
    content: string
    html_url: string
    updated_at?: string
    isLocal?: boolean  // 标记是否为本地片段
    gistId?: string    // 关联的Gist ID
}

interface TodoItem {
    id: string
    title: string
    completed: boolean
    createdAt: number
    priority?: 'low' | 'medium' | 'high'
}

interface SnippetSidebarProps {
    isVisible: boolean
    width?: number
    collapsed?: boolean
    onCollapse?: () => void
    onPasteToClipboard?: (content: string) => void
    onPasteToTerminal?: (content: string) => void
    style?: React.CSSProperties
}

interface EditDialogProps {
    snippet: Snippet | null
    isNew: boolean
    onSave: (snippet: Partial<Snippet> & { title: string; content: string; format: SnippetFormat }) => void
    onClose: () => void
}

interface WikiEditDialogProps {
    page: WikiPage | null
    isNew: boolean
    onSave: (data: { title: string; content: string }) => void
    onClose: () => void
}

interface InputDialogProps {
    title: string
    placeholder: string
    defaultValue?: string
    onConfirm: (value: string) => void
    onClose: () => void
}

interface GistListItem {
    id: string
    description: string
    files: { [key: string]: any }
    html_url: string
    updated_at: string
}

interface GistListDialogProps {
    gists: GistListItem[]
    loading: boolean
    onSelect: (gist: GistListItem) => void
    onSelectAll: () => void
    onClose: () => void
}

// Gist List Dialog Component
function GistListDialog({ gists, loading, onSelect, onSelectAll, onClose }: Readonly<GistListDialogProps>) {
    return (
        <div className="snippet-edit-overlay" onClick={onClose}>
            <div className="snippet-edit-dialog" onClick={e => e.stopPropagation()} style={{ width: '700px', maxHeight: '80vh' }}>
                <div className="snippet-edit-header">
                    <h3>選擇要導入的 Gists</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                <div className="snippet-edit-body" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                            載入中...
                        </div>
                    ) : gists.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: '#888' }}>
                            沒有找到 Gists
                        </div>
                    ) : (
                        <>
                            <div style={{ marginBottom: '12px', padding: '8px', background: 'var(--bg-tertiary)', borderRadius: '4px' }}>
                                <button 
                                    className="btn-primary" 
                                    onClick={onSelectAll}
                                    style={{ width: '100%' }}
                                >
                                    📦 導入全部 ({gists.length} 個 Gists)
                                </button>
                            </div>
                            {gists.map(gist => {
                                const fileCount = Object.keys(gist.files).length
                                const fileNames = Object.keys(gist.files).slice(0, 3).join(', ')
                                const moreFiles = fileCount > 3 ? ` +${fileCount - 3} more` : ''
                                
                                return (
                                    <div 
                                        key={gist.id}
                                        className="snippet-sidebar-item"
                                        onClick={() => onSelect(gist)}
                                        style={{ 
                                            cursor: 'pointer',
                                            marginBottom: '8px',
                                            padding: '12px',
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: '4px',
                                            border: '1px solid var(--border-color)'
                                        }}
                                    >
                                        <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                                            {gist.description || '(無描述)'}
                                        </div>
                                        <div style={{ fontSize: '11px', color: '#888', marginBottom: '4px' }}>
                                            📄 {fileCount} 個檔案: {fileNames}{moreFiles}
                                        </div>
                                        <div style={{ fontSize: '10px', color: '#666' }}>
                                            🕒 {new Date(gist.updated_at).toLocaleString('zh-TW')}
                                        </div>
                                    </div>
                                )
                            })}
                        </>
                    )}
                </div>
                <div className="snippet-edit-footer">
                    <button className="btn-secondary" onClick={onClose}>取消</button>
                </div>
            </div>
        </div>
    )
}

// Input Dialog Component
function InputDialog({ title, placeholder, defaultValue = '', onConfirm, onClose }: Readonly<InputDialogProps>) {
    const [value, setValue] = useState(defaultValue)

    // Update value when defaultValue changes
    useEffect(() => {
        setValue(defaultValue)
    }, [defaultValue])

    const handleConfirm = () => {
        if (value.trim()) {
            onConfirm(value.trim())
            onClose()
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleConfirm()
        } else if (e.key === 'Escape') {
            onClose()
        }
    }

    return (
        <div className="snippet-edit-overlay" onClick={onClose}>
            <div className="snippet-edit-dialog" onClick={e => e.stopPropagation()} style={{ width: '500px' }}>
                <div className="snippet-edit-header">
                    <h3>{title}</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                <div className="snippet-edit-body">
                    <div className="form-group">
                        {defaultValue && (
                            <small style={{ display: 'block', marginBottom: '8px', color: '#7bbda4' }}>
                                💡 已從剪貼板檢測到 Gist URL
                            </small>
                        )}
                        <input
                            type="text"
                            value={value}
                            onChange={e => setValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder={placeholder}
                            autoFocus
                            style={{ fontSize: '14px' }}
                        />
                    </div>
                </div>
                <div className="snippet-edit-footer">
                    <button className="btn-secondary" onClick={onClose}>取消</button>
                    <button
                        className="btn-primary"
                        onClick={handleConfirm}
                        disabled={!value.trim()}
                    >
                        確定
                    </button>
                </div>
            </div>
        </div>
    )
}

// Wiki Edit/Create Dialog Component
function WikiEditDialog({ page, isNew, onSave, onClose }: Readonly<WikiEditDialogProps>) {
    const [title, setTitle] = useState(page?.title || '')
    const [content, setContent] = useState(page?.content || '')

    const handleSave = () => {
        if (!title.trim() || !content.trim()) return
        onSave({ title: title.trim(), content: content.trim() })
        onClose()
    }

    return (
        <div className="snippet-edit-overlay" onClick={onClose}>
            <div className="snippet-edit-dialog" onClick={e => e.stopPropagation()}>
                <div className="snippet-edit-header">
                    <h3>{isNew ? '新增分享筆記' : '編輯分享筆記'}</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                <div className="snippet-edit-body">
                    <div className="form-group">
                        <label>標題</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="輸入標題..."
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label>內容 (支援 Markdown)</label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="輸入內容... 支援 Markdown 語法"
                            rows={15}
                            style={{ fontFamily: 'monospace' }}
                        />
                    </div>
                </div>
                <div className="snippet-edit-footer">
                    <button className="btn-secondary" onClick={onClose}>取消</button>
                    <button
                        className="btn-primary"
                        onClick={handleSave}
                        disabled={!title.trim() || !content.trim()}
                    >
                        儲存
                    </button>
                </div>
            </div>
        </div>
    )
}

// Edit/Create Dialog Component
function EditDialog({ snippet, isNew, onSave, onClose }: Readonly<EditDialogProps>) {
    const [title, setTitle] = useState(snippet?.title || '')
    const [content, setContent] = useState(snippet?.content || '')

    const handleSave = () => {
        if (!title.trim() || !content.trim()) return
        onSave({ title: title.trim(), content: content.trim(), format: 'plaintext' })
        onClose()
    }

    return (
        <div className="snippet-edit-overlay" onClick={onClose}>
            <div className="snippet-edit-dialog" onClick={e => e.stopPropagation()}>
                <div className="snippet-edit-header">
                    <h3>{isNew ? '新增個人筆記' : '編輯個人筆記'}</h3>
                    <button className="close-btn" onClick={onClose}>×</button>
                </div>
                <div className="snippet-edit-body">
                    <div className="form-group">
                        <label>Title</label>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Enter snippet name..."
                            autoFocus
                        />
                    </div>
                    <div className="form-group">
                        <label>Content</label>
                        <textarea
                            value={content}
                            onChange={e => setContent(e.target.value)}
                            placeholder="Enter snippet content..."
                            rows={20}
                        />
                    </div>
                </div>
                <div className="snippet-edit-footer">
                    <button className="btn-secondary" onClick={onClose}>Cancel</button>
                    <button
                        className="btn-primary"
                        onClick={handleSave}
                        disabled={!title.trim() || !content.trim()}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    )
}

export function SnippetSidebar({
    isVisible,
    width = 280,
    collapsed = false,
    onCollapse,
    onPasteToClipboard,
    onPasteToTerminal,
    style
}: Readonly<SnippetSidebarProps>) {
    const [activeTab, setActiveTab] = useState<TabType>('snippets')
    const [snippets, setSnippets] = useState<Snippet[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [communitySearchQuery, setCommunitySearchQuery] = useState('')
    const [editingSnippet, setEditingSnippet] = useState<Snippet | null>(null)
    const [isCreating, setIsCreating] = useState(false)
    
    // TODO tab state
    const [todos, setTodos] = useState<TodoItem[]>([])
    const [newTodoTitle, setNewTodoTitle] = useState('')
    const todoInputRef = useRef<HTMLInputElement>(null)
    
    // Community tab state (local shareable snippets)
    const [wikiPages, setWikiPages] = useState<WikiPage[]>([])
    const [isLoadingWiki, setIsLoadingWiki] = useState(false)
    const [wikiError, setWikiError] = useState<string | null>(null)
    const [repoUrl, setRepoUrl] = useState('fareastone-mikekuan/better-agent-terminal')
    const [editingWiki, setEditingWiki] = useState<WikiPage | null>(null)
    const [isCreatingWiki, setIsCreatingWiki] = useState(false)
    const [inputDialog, setInputDialog] = useState<{ title: string; placeholder: string; defaultValue?: string; onConfirm: (value: string) => void } | null>(null)
    const [showGistList, setShowGistList] = useState(false)
    const [gistList, setGistList] = useState<GistListItem[]>([])
    const [gistListLoading, setGistListLoading] = useState(false)

    const loadSnippets = useCallback(async () => {
        try {
            let data: Snippet[]
            if (searchQuery) {
                data = await window.electronAPI.snippet.search(searchQuery)
            } else {
                data = await window.electronAPI.snippet.getAll()
            }
            setSnippets(data)
        } catch (error) {
            console.error('Failed to load snippets:', error)
        }
    }, [searchQuery])

    useEffect(() => {
        if (isVisible) {
            loadSnippets()
        }
    }, [isVisible, loadSnippets])

    // Load local and GitHub wiki pages
    const loadWikiPages = useCallback(async () => {
        if (activeTab !== 'community') return
        
        setIsLoadingWiki(true)
        setWikiError(null)
        
        try {
            // Load local wiki pages from localStorage
            const localPagesJson = localStorage.getItem('community-wiki-pages')
            const localPages: WikiPage[] = localPagesJson ? JSON.parse(localPagesJson) : []
            
            // 只給沒有 isLocal 屬性的舊數據設置默認值（向後兼容）
            // 已經有 isLocal 屬性的（如 Gist 片段）保持不變
            localPages.forEach(page => {
                if (page.isLocal === undefined) {
                    page.isLocal = true
                }
            })
            
            setWikiPages(localPages)
        } catch (error) {
            console.error('Failed to load wiki pages:', error)
            setWikiError(error instanceof Error ? error.message : 'Failed to load wiki')
        } finally {
            setIsLoadingWiki(false)
        }
    }, [activeTab])

    useEffect(() => {
        if (isVisible && activeTab === 'community') {
            loadWikiPages()
        }
    }, [isVisible, activeTab, loadWikiPages])

    const saveWikiPages = (pages: WikiPage[]) => {
        try {
            localStorage.setItem('community-wiki-pages', JSON.stringify(pages))
            setWikiPages(pages)
            setWikiError(null)
        } catch (error) {
            console.error('Failed to save wiki pages:', error)
            const errorMsg = error instanceof Error ? error.message : 'Failed to save'
            setWikiError(errorMsg)
            alert('❌ 保存失敗: ' + errorMsg)
        }
    }

    const handleCreateWiki = (data: { title: string; content: string }) => {
        try {
            const newPage: WikiPage = {
                name: data.title.replace(/\s+/g, '-'),
                title: data.title,
                content: data.content,
                html_url: '#',
                isLocal: true,
                updated_at: new Date().toISOString()
            }
            const updatedPages = [...wikiPages, newPage]
            saveWikiPages(updatedPages)
            setWikiError(null)
        } catch (error) {
            console.error('Create wiki failed:', error)
            setWikiError('創建失敗: ' + (error as Error).message)
            alert('❌ 創建失敗: ' + (error as Error).message)
        }
    }

    const handleUpdateWiki = async (oldName: string, data: { title: string; content: string }) => {
        try {
            const page = wikiPages.find(p => p.name === oldName)
            
            // 檢查是否為 Gist 片段
            if (page?.gistId && !page.isLocal) {
                const syncToCloud = confirm(
                    `此片段來自 Gist，是否要同步更新到雲端？\n\n` +
                    `📝 標題：${data.title}\n` +
                    `☁️ Gist ID：${page.gistId}\n\n` +
                    `選擇「確定」- 同步到雲端並更新本地\n` +
                    `選擇「取消」- 只更新本地副本`
                )
                
                if (syncToCloud) {
                    await updateGistContent(page.gistId, data.title, data.content)
                }
            }
            
            // 更新本地
            const updatedPages = wikiPages.map(page => 
                page.name === oldName 
                    ? { 
                        ...page, 
                        name: data.title.replace(/\s+/g, '-'),
                        title: data.title, 
                        content: data.content,
                        updated_at: new Date().toISOString()
                      }
                    : page
            )
            saveWikiPages(updatedPages)
            setWikiError(null)
        } catch (error) {
            console.error('Update wiki failed:', error)
            setWikiError('更新失敗: ' + (error as Error).message)
            alert('❌ 更新失敗: ' + (error as Error).message)
        }
    }
    
    const updateGistContent = async (gistId: string, title: string, content: string) => {
        try {
            const token = localStorage.getItem('gist_token')
            if (!token) {
                throw new Error('請先設置 GitHub Token')
            }
            
            const filename = `${title.replace(/\s+/g, '-')}.md`
            const requestBody = JSON.stringify({
                files: {
                    [filename]: {
                        content: content
                    }
                }
            })
            
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'Content-Type': 'application/json'
                },
                body: requestBody
            })
            
            if (!response.ok) {
                throw new Error(`GitHub API 錯誤: ${response.status} ${response.statusText}`)
            }
            
            alert('✅ 已同步更新到雲端 Gist')
        } catch (error) {
            console.error('Update gist failed:', error)
            throw new Error('同步到雲端失敗: ' + (error as Error).message)
        }
    }

    const handleDeleteWiki = (name: string) => {
        const page = wikiPages.find(p => p.name === name)
        
        // 只能刪除本地片段
        if (!page?.isLocal) {
            alert('❌ 無法刪除！\n\n此片段來自 Gist，只能刪除本地建立的片段。\n\n如需刪除 Gist 片段，請前往 GitHub 操作。')
            return
        }
        
        if (!confirm(`確定要刪除這個本地片段嗎？\n\n「${page.title}」`)) return
        
        try {
            // 只删除匹配的本地片段，保留 Gist 片段
            const updatedPages = wikiPages.filter(p => !(p.name === name && p.isLocal))
            saveWikiPages(updatedPages)
            alert('✅ 已刪除本地片段')
        } catch (error) {
            console.error('Delete wiki failed:', error)
            alert('❌ 刪除失敗: ' + (error as Error).message)
        }
    }
    
    const handleRemoveGist = (name: string, gistId: string) => {
        const page = wikiPages.find(p => p.name === name && p.gistId === gistId)
        
        if (!page || page.isLocal) {
            return
        }
        
        if (!confirm(`確定要從列表中移除這個 Gist 片段嗎？\n\n「${page.title}」\n\n⚠️ 注意：\n- 只會從本地列表移除\n- 不會刪除 GitHub 上的 Gist\n- 可以重新導入`)) return
        
        try {
            // 只移除匹配的 Gist 片段
            const updatedPages = wikiPages.filter(p => !(p.name === name && p.gistId === gistId))
            saveWikiPages(updatedPages)
            alert('✅ 已從列表移除')
        } catch (error) {
            console.error('Remove gist failed:', error)
            alert('❌ 移除失敗: ' + (error as Error).message)
        }
    }

    const handleDeleteCloudGist = async (name: string, gistId: string) => {
        const page = wikiPages.find(p => p.name === name && p.gistId === gistId)
        
        if (!page || page.isLocal) {
            return
        }

        if (!confirm(`⚠️ 確定要刪除雲端 Gist 嗎？\n\n「${page.title}」\n\n❌ 危險操作：\n- 會永久刪除 GitHub 上的 Gist\n- 無法復原\n- 同時會從本地列表移除`)) return
        
        try {
            const token = localStorage.getItem('gist_token')
            if (!token) {
                alert('❌ 請先設置 GitHub Token')
                return
            }

            // 調用 GitHub API 刪除 Gist
            const response = await fetch(`https://api.github.com/gists/${gistId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            })

            if (!response.ok) {
                throw new Error(`GitHub API 錯誤: ${response.status} ${response.statusText}`)
            }

            // 刪除成功後，從本地列表移除
            const updatedPages = wikiPages.filter(p => !(p.name === name && p.gistId === gistId))
            saveWikiPages(updatedPages)
            alert('✅ 已刪除雲端 Gist 並從列表移除')
        } catch (error) {
            console.error('Delete cloud gist failed:', error)
            alert('❌ 刪除雲端 Gist 失敗: ' + (error as Error).message)
        }
    }

    const handleUploadToGist = async (page: WikiPage) => {
        try {
            // Get token from gist_token in localStorage
            const token = localStorage.getItem('gist_token')
            
            if (!token) {
                alert('請先設定 GitHub Token\n\n1. 點擊右上角 ⚙️ 設定按鈕\n2. 找到 "📦 GitHub Gist" 區域\n3. 輸入您的 Personal Access Token\n4. Token 需要 "gist" 權限\n\n前往 https://github.com/settings/tokens/new 建立 Token')
                return
            }

            const response = await fetch('https://api.github.com/gists', {
                method: 'POST',
                headers: {
                    'Authorization': `token ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    description: page.title,
                    public: true,
                    files: {
                        [`${page.name}.md`]: {
                            content: page.content
                        }
                    }
                })
            })

            if (!response.ok) {
                throw new Error(`GitHub API 錯誤: ${response.statusText}`)
            }

            const gistData = await response.json()
            
            // 更新本地片段，添加 gistId、html_url 並設置為雲端片段
            const updatedPages = wikiPages.map(p => 
                p.name === page.name 
                    ? { ...p, gistId: gistData.id, html_url: gistData.html_url, isLocal: false }
                    : p
            )
            saveWikiPages(updatedPages)
            alert('✅ 已成功上傳到 GitHub Gist！\n\n' + gistData.html_url)
        } catch (error) {
            console.error('Upload to Gist failed:', error)
            alert('❌ 上傳失敗: ' + (error as Error).message)
        }
    }

    const loadUserGists = async () => {
        try {
            setGistListLoading(true)
            
            // 获取 GitHub Token
            const token = localStorage.getItem('gist_token')
            
            if (!token) {
                setWikiError('請先設定 GitHub Token')
                alert('❌ 請先在設定中配置 GitHub Token (Gist)')
                setGistList([])
                return
            }
            
            // 首先获取当前用户信息
            console.log('Fetching authenticated user...')
            const userResponse = await fetch('https://api.github.com/user', {
                headers: {
                    'Authorization': `token ${token}`
                }
            })
            
            if (!userResponse.ok) {
                throw new Error(`無法獲取用戶信息: ${userResponse.status} ${userResponse.statusText}\n\n請檢查 Token 是否有效`)
            }
            
            const userData = await userResponse.json()
            const username = userData.login
            console.log('Authenticated user:', username)
            
            // 然後获取该用户的 Gists
            console.log('Loading gists for user:', username)
            const response = await fetch(`https://api.github.com/users/${username}/gists`, {
                headers: {
                    'Authorization': `token ${token}`
                }
            })
            
            if (!response.ok) {
                throw new Error(`無法獲取 Gists: ${response.status} ${response.statusText}`)
            }
            
            const gists = await response.json()
            console.log('Loaded gists:', gists.length)
            setGistList(gists)
            
            if (gists.length === 0) {
                alert('ℹ️ 您還沒有任何 Gists\n\n請先上傳片段到 Gist 或在 GitHub 上建立 Gist')
            }
        } catch (error) {
            console.error('Load gists failed:', error)
            alert('❌ 載入 Gists 失敗: ' + (error as Error).message)
            setGistList([])
        } finally {
            setGistListLoading(false)
        }
    }

    const importGistById = async (gistId: string, currentPages: WikiPage[]) => {
        try {
            setIsLoadingWiki(true)
            setWikiError(null)
            
            console.log('Fetching Gist:', gistId)
            const response = await fetch(`https://api.github.com/gists/${gistId}`)
            
            if (!response.ok) {
                const errorMsg = `無法獲取 Gist: ${response.status} ${response.statusText}`
                console.error(errorMsg)
                setWikiError(errorMsg)
                throw new Error(errorMsg)
            }

            const gistData = await response.json()
            console.log('Gist data:', gistData)
            
            const files = Object.values(gistData.files || {})
            
            if (files.length === 0) {
                return { success: false, count: 0, message: 'Gist 中沒有檔案', pages: currentPages }
            }

            // 導入所有檔案
            const newPages: WikiPage[] = files.map((file: any) => {
                console.log('Processing file:', file.filename)
                return {
                    name: file.filename.replace(/\.md$/, ''),
                    title: file.filename.replace(/\.md$/, ''),
                    content: file.content || '',
                    html_url: gistData.html_url,
                    gistId: gistData.id,
                    isLocal: false,
                    updated_at: gistData.updated_at
                }
            })

            // 过滤掉已存在的片段（根据 gistId 和 name）
            const existingKeys = new Set(currentPages.map(p => `${p.gistId || 'local'}-${p.name}`))
            const filteredPages = newPages.filter(p => {
                const key = `${p.gistId}-${p.name}`
                const exists = existingKeys.has(key)
                if (exists) {
                    console.log('Skipping duplicate:', key)
                }
                return !exists
            })

            console.log(`Import: ${newPages.length} total, ${filteredPages.length} new`)

            const updatedPages = [...currentPages, ...filteredPages]
            
            return { success: true, count: filteredPages.length, total: newPages.length, pages: updatedPages }
        } catch (error) {
            console.error('Import from Gist failed:', error)
            return { success: false, count: 0, message: (error as Error).message, pages: currentPages }
        } finally {
            setIsLoadingWiki(false)
        }
    }

    const handleImportFromGist = async () => {
        // 显示 Gist 列表对话框
        setShowGistList(true)
        loadUserGists()
    }
    
    const handleImportSingleGist = async (gist: GistListItem) => {
        setShowGistList(false)
        const result = await importGistById(gist.id, wikiPages)
        if (result.success) {
            if (result.count > 0) {
                saveWikiPages(result.pages)
                alert(`✅ 已成功從 "${gist.description || '無描述'}" 導入 ${result.count} 個片段！`)
            } else {
                alert(`ℹ️ "${gist.description || '無描述'}" 的所有片段已存在`)
            }
        } else {
            alert(`❌ 導入 "${gist.description || '無描述'}" 失敗: ${result.message}`)
        }
    }
    
    const handleImportAllGists = async () => {
        setShowGistList(false)
        
        let totalImported = 0
        let totalSkipped = 0
        let failed = 0
        let currentPages = [...wikiPages]
        
        for (const gist of gistList) {
            const result = await importGistById(gist.id, currentPages)
            if (result.success) {
                totalImported += result.count
                totalSkipped += (result.total - result.count)
                currentPages = result.pages
            } else {
                failed++
            }
        }
        
        // 一次性保存所有导入的数据
        if (currentPages.length > wikiPages.length) {
            saveWikiPages(currentPages)
        }
        
        const message = [
            `✅ 導入完成！`,
            `成功: ${totalImported} 個片段`,
            totalSkipped > 0 ? `跳過: ${totalSkipped} 個已存在` : '',
            failed > 0 ? `失敗: ${failed} 個 Gists` : ''
        ].filter(Boolean).join('\n')
        
        alert(message)
    }
    
    // Keep old function for manual URL input (optional)
    const handleImportFromGistManual = async () => {
        try {
            // 尝试从剪贴板读取
            let clipboardText = ''
            try {
                clipboardText = await navigator.clipboard.readText()
            } catch (err) {
                console.log('Cannot read clipboard:', err)
            }

            // 检查剪贴板是否包含 Gist URL
            const clipboardGistMatch = clipboardText.match(/gist\.github\.com\/[^\/]+\/([a-f0-9]+)|^([a-f0-9]+)$/)
            const defaultValue = clipboardGistMatch ? clipboardText.trim() : ''

            setInputDialog({
                title: '手動輸入 Gist URL',
                placeholder: '輸入 Gist URL 或 ID (e.g., abc123 or https://gist.github.com/user/abc123)',
                defaultValue: defaultValue,
                onConfirm: async (gistUrl) => {
                    try {
                        setIsLoadingWiki(true)
                        setWikiError(null)

                        // 從 URL 中提取 Gist ID
                        const gistIdMatch = gistUrl.match(/gist\.github\.com\/[^\/]+\/([a-f0-9]+)|^([a-f0-9]+)$/)
                        const gistId = gistIdMatch?.[1] || gistIdMatch?.[2]
                        
                        if (!gistId) {
                            setWikiError('無效的 Gist URL 或 ID')
                            alert('❌ 無效的 Gist URL 或 ID')
                            return
                        }

                        console.log('Fetching Gist:', gistId)
                        const response = await fetch(`https://api.github.com/gists/${gistId}`)
                        
                        if (!response.ok) {
                            const errorMsg = `無法獲取 Gist: ${response.status} ${response.statusText}`
                            console.error(errorMsg)
                            setWikiError(errorMsg)
                            throw new Error(errorMsg)
                        }

                        const gistData = await response.json()
                        console.log('Gist data:', gistData)
                        
                        const files = Object.values(gistData.files || {})
                        
                        if (files.length === 0) {
                            setWikiError('Gist 中沒有檔案')
                            alert('❌ Gist 中沒有檔案')
                            return
                        }

                        // 導入所有檔案
                        const newPages: WikiPage[] = files.map((file: any) => {
                            console.log('Processing file:', file.filename)
                            return {
                                name: file.filename.replace(/\.md$/, ''),
                                title: file.filename.replace(/\.md$/, ''),
                                content: file.content || '',
                                html_url: gistData.html_url,
                                gistId: gistData.id,
                                isLocal: false,
                                updated_at: gistData.updated_at
                            }
                        })

                        // 过滤掉已存在的片段（根据 gistId 和 name）
                        const existingKeys = new Set(wikiPages.map(p => `${p.gistId || 'local'}-${p.name}`))
                        const filteredPages = newPages.filter(p => {
                            const key = `${p.gistId}-${p.name}`
                            const exists = existingKeys.has(key)
                            if (exists) {
                                console.log('Skipping duplicate:', key)
                            }
                            return !exists
                        })

                        console.log(`Import: ${newPages.length} total, ${filteredPages.length} new`)

                        if (filteredPages.length === 0) {
                            alert('ℹ️ 所有片段已存在，沒有新增內容')
                            return
                        }

                        const updatedPages = [...wikiPages, ...filteredPages]
                        saveWikiPages(updatedPages)
                        alert(`✅ 已成功導入 ${filteredPages.length} 個片段！`)
                    } catch (error) {
                        console.error('Import from Gist failed:', error)
                        const errorMsg = (error as Error).message
                        setWikiError(errorMsg)
                        alert('❌ 導入失敗: ' + errorMsg)
                    } finally {
                        setIsLoadingWiki(false)
                    }
                }
            })
        } catch (error) {
            console.error('Import initialization failed:', error)
            alert('❌ 初始化失敗: ' + (error as Error).message)
        }
    }

    const handleCreate = async (data: { title: string; content: string; format: SnippetFormat }) => {
        try {
            await window.electronAPI.snippet.create(data)
            loadSnippets()
        } catch (error) {
            console.error('Failed to create snippet:', error)
        }
    }

    const handleUpdate = async (id: number, data: Partial<{ title: string; content: string; format: SnippetFormat }>) => {
        try {
            await window.electronAPI.snippet.update(id, data)
            loadSnippets()
        } catch (error) {
            console.error('Failed to update snippet:', error)
        }
    }

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this snippet?')) return
        try {
            await window.electronAPI.snippet.delete(id)
            loadSnippets()
        } catch (error) {
            console.error('Failed to delete snippet:', error)
        }
    }

    const handleCopyToClipboard = (content: string) => {
        try {
            if (onPasteToClipboard) {
                onPasteToClipboard(content)
            } else {
                navigator.clipboard.writeText(content)
            }
        } catch (error) {
            console.error('Copy to clipboard failed:', error)
            alert('❌ 複製失敗')
        }
    }

    const handlePasteToTerminal = (content: string) => {
        try {
            if (onPasteToTerminal) {
                onPasteToTerminal(content)
            }
        } catch (error) {
            console.error('Paste to terminal failed:', error)
            alert('❌ 貼上失敗: ' + (error as Error).message)
        }
    }

    const handleDoubleClick = (snippet: Snippet) => {
        // 個人筆記雙擊直接開啟編輯
        setEditingSnippet(snippet)
    }

    const openWikiInBrowser = (url: string) => {
        if (url && url !== '#') {
            window.open(url, '_blank')
        }
    }

    const editWikiPage = (page: WikiPage) => {
        try {
            setEditingWiki(page)
        } catch (error) {
            console.error('Edit wiki page failed:', error)
        }
    }

    const copyWikiContent = (page: WikiPage) => {
        try {
            const content = `# ${page.title}\n\n${page.content}\n\n---\nSource: ${page.html_url}`
            handleCopyToClipboard(content)
        } catch (error) {
            console.error('Copy wiki content failed:', error)
            alert('❌ 複製失敗')
        }
    }

    const createNewWikiPage = () => {
        try {
            // 清除错误状态
            setWikiError(null)
            setIsCreatingWiki(true)
        } catch (error) {
            console.error('Create new wiki page failed:', error)
        }
    }

    // Load todos from localStorage
    const loadTodos = useCallback(() => {
        try {
            const saved = localStorage.getItem('better-terminal-todos')
            if (saved) {
                setTodos(JSON.parse(saved))
            }
        } catch (error) {
            console.error('Failed to load todos:', error)
        }
    }, [])

    // Save todos to localStorage
    const saveTodos = (updatedTodos: TodoItem[]) => {
        try {
            localStorage.setItem('better-terminal-todos', JSON.stringify(updatedTodos))
            setTodos(updatedTodos)
        } catch (error) {
            console.error('Failed to save todos:', error)
        }
    }

    // Add new todo
    const handleAddTodo = () => {
        if (!newTodoTitle.trim()) {
            // 如果輸入框為空，聚焦到輸入框提示用戶輸入
            todoInputRef.current?.focus()
            return
        }
        const newTodo: TodoItem = {
            id: Date.now().toString(),
            title: newTodoTitle.trim(),
            completed: false,
            createdAt: Date.now(),
            priority: 'medium'
        }
        saveTodos([newTodo, ...todos])
        setNewTodoTitle('')
        // 新增後重新聚焦輸入框
        setTimeout(() => todoInputRef.current?.focus(), 0)
    }

    // Toggle todo completion
    const handleToggleTodo = (id: string) => {
        const updated = todos.map(todo => 
            todo.id === id ? { ...todo, completed: !todo.completed } : todo
        )
        saveTodos(updated)
    }

    // Delete todo
    const handleDeleteTodo = (id: string) => {
        if (!confirm('確定要刪除這個 TODO？')) return
        saveTodos(todos.filter(todo => todo.id !== id))
    }

    // Change todo priority
    const handleChangePriority = (id: string, priority: 'low' | 'medium' | 'high') => {
        const updated = todos.map(todo => 
            todo.id === id ? { ...todo, priority } : todo
        )
        saveTodos(updated)
    }

    // Load todos on mount
    useEffect(() => {
        if (activeTab === 'todo') {
            loadTodos()
        }
    }, [activeTab, loadTodos])

    if (!isVisible) return null

    // Collapsed state - show icon bar
    if (collapsed) {
        return (
            <div
                className="collapsed-bar collapsed-bar-right"
                onClick={onCollapse}
                title="Expand Snippets"
            >
                <div className="collapsed-bar-icon">📝</div>
            </div>
        )
    }

    return (
        <>
            <aside className="snippet-sidebar" style={{ width: `${width}px`, minWidth: `${width}px`, ...style }}>
                <div className="snippet-sidebar-header">
                    <h3>📝 筆記</h3>
                    <div className="snippet-header-actions">
                        {activeTab === 'snippets' && (
                            <button className="snippet-add-btn" onClick={() => setIsCreating(true)} title="New Snippet">
                                +
                            </button>
                        )}
                        {activeTab === 'community' && (
                            <>
                                <button className="snippet-add-btn" onClick={createNewWikiPage} title="新增分享筆記">
                                    +
                                </button>
                                <button className="snippet-add-btn" onClick={handleImportFromGist} title="從 Gist 導入">
                                    ⬇️
                                </button>
                                <button className="snippet-add-btn" onClick={loadWikiPages} title="重新整理">
                                    ↻
                                </button>
                            </>
                        )}
                        {activeTab === 'todo' && (
                            <button className="snippet-add-btn" onClick={handleAddTodo} title="新增 TODO">
                                +
                            </button>
                        )}
                        {onCollapse && (
                            <button className="snippet-collapse-btn" onClick={onCollapse} title="Collapse Panel">
                                »
                            </button>
                        )}
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="snippet-tabs">
                    <button 
                        className={`snippet-tab ${activeTab === 'snippets' ? 'active' : ''}`}
                        onClick={() => setActiveTab('snippets')}
                    >
                        📝 個人筆記
                    </button>
                    <button 
                        className={`snippet-tab ${activeTab === 'community' ? 'active' : ''}`}
                        onClick={() => setActiveTab('community')}
                    >
                        🌐 分享筆記
                    </button>
                    <button 
                        className={`snippet-tab ${activeTab === 'todo' ? 'active' : ''}`}
                        onClick={() => setActiveTab('todo')}
                    >
                        ✅ TODO
                    </button>
                </div>

                {/* Snippets Tab Content */}
                {activeTab === 'snippets' && (
                    <>
                        <div className="snippet-sidebar-search">
                            <input
                                type="text"
                                placeholder="搜尋筆記..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="snippet-sidebar-list">
                            {snippets.length === 0 ? (
                                <div className="snippet-empty">
                                    {searchQuery ? 'No matching snippets' : 'No snippets yet. Click + to add one.'}
                                </div>
                            ) : (
                                snippets.map(snippet => (
                                    <div
                                        key={snippet.id}
                                        className={`snippet-sidebar-item ${searchQuery ? 'search-match' : ''}`}
                                        onDoubleClick={() => handleDoubleClick(snippet)}
                                    >
                                        <div className="snippet-item-main">
                                            <span className="snippet-item-title">{snippet.title}</span>
                                            <span className={`snippet-item-format ${snippet.format}`}>
                                                {snippet.format === 'markdown' ? 'MD' : 'Text'}
                                            </span>
                                        </div>
                                        <div className="snippet-item-preview">
                                            {snippet.content.substring(0, 50)}
                                            {snippet.content.length > 50 ? '...' : ''}
                                        </div>
                                        <div className="snippet-item-actions">
                                            <button
                                                className="snippet-action-btn"
                                                onClick={() => handlePasteToTerminal(snippet.content)}
                                                title="Paste to Terminal"
                                            >
                                                ▶️
                                            </button>
                                            <button
                                                className="snippet-action-btn"
                                                onClick={() => handleCopyToClipboard(snippet.content)}
                                                title="Copy to Clipboard"
                                            >
                                                📋
                                            </button>
                                            <button
                                                className="snippet-action-btn"
                                                onClick={() => setEditingSnippet(snippet)}
                                                title="Edit"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className="snippet-action-btn danger"
                                                onClick={() => handleDelete(snippet.id)}
                                                title="Delete"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}

                {/* Community Tab Content - Local Shareable Snippets */}
                {activeTab === 'community' && (
                    <>
                        <div className="snippet-sidebar-search">
                            <input
                                type="text"
                                placeholder="搜尋筆記..."
                                value={communitySearchQuery}
                                onChange={e => setCommunitySearchQuery(e.target.value)}
                            />
                        </div>
                        <div className="snippet-sidebar-search" style={{ padding: '8px' }}>
                            <small style={{ fontSize: '10px', color: '#888', display: 'block', marginBottom: '4px' }}>
                                本地分享筆記，可導入/導出到 GitHub
                            </small>
                        </div>

                        <div className="snippet-sidebar-list">
                            {isLoadingWiki ? (
                                <div className="snippet-empty">載入中...</div>
                            ) : wikiError ? (
                                <div className="snippet-empty" style={{ color: '#ef4444' }}>
                                    錯誤: {wikiError}
                                </div>
                            ) : wikiPages.length === 0 ? (
                                <div className="snippet-empty">
                                    尚無分享筆記
                                    <br />
                                    <small style={{ fontSize: '10px', color: '#888' }}>
                                        點擊上方 + 按鈕建立新的分享筆記
                                    </small>
                                </div>
                            ) : (
                                wikiPages
                                    .filter(page => {
                                        if (!communitySearchQuery.trim()) return true
                                        const query = communitySearchQuery.toLowerCase()
                                        return page.title.toLowerCase().includes(query) || 
                                               page.content.toLowerCase().includes(query)
                                    })
                                    .map((page, index) => (
                                    <div
                                        key={`${page.name}-${index}`}
                                        className="snippet-sidebar-item community-item wiki-item"
                                        onDoubleClick={() => editWikiPage(page)}
                                    >
                                        <div className="snippet-item-main">
                                            <span className="snippet-item-title">
                                                {page.isLocal ? '📝' : '☁️'} {page.title}
                                            </span>
                                            {!page.isLocal && (
                                                <span style={{ fontSize: '9px', color: '#7bbda4', marginLeft: '4px' }}>
                                                    (Gist)
                                                </span>
                                            )}
                                        </div>
                                        <div className="snippet-item-preview">
                                            {page.content.substring(0, 100).replace(/[#*`\n]/g, ' ').trim()}
                                            {page.content.length > 100 ? '...' : ''}
                                        </div>
                                        <div className="snippet-item-actions">
                                            <button
                                                className="snippet-action-btn"
                                                onClick={() => editWikiPage(page)}
                                                title="編輯"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className="snippet-action-btn"
                                                onClick={() => copyWikiContent(page)}
                                                title="複製內容"
                                            >
                                                📋
                                            </button>
                                            <button
                                                className="snippet-action-btn"
                                                onClick={() => handlePasteToTerminal(page.content)}
                                                title="貼到終端機"
                                            >
                                                ▶️
                                            </button>
                                            {page.isLocal && !page.gistId && (
                                                <button
                                                    className="snippet-action-btn"
                                                    onClick={() => handleUploadToGist(page)}
                                                    title="上傳到 Gist"
                                                    style={{ fontSize: '12px' }}
                                                >
                                                    ⬆️
                                                </button>
                                            )}
                                            {page.gistId && (
                                                <button
                                                    className="snippet-action-btn"
                                                    onClick={() => window.open(page.html_url, '_blank')}
                                                    title="在 Gist 中查看"
                                                    style={{ fontSize: '10px', opacity: 0.7 }}
                                                >
                                                    🔗
                                                </button>
                                            )}
                                            {page.isLocal ? (
                                                <button
                                                    className="snippet-action-btn danger"
                                                    onClick={() => handleDeleteWiki(page.name)}
                                                    title="刪除本地片段"
                                                >
                                                    🗑️
                                                </button>
                                            ) : (
                                                <>
                                                    <button
                                                        className="snippet-action-btn"
                                                        onClick={() => handleRemoveGist(page.name, page.gistId || '')}
                                                        title="從列表移除 (不會刪除 Gist)"
                                                        style={{ opacity: 0.6 }}
                                                    >
                                                        ✖️
                                                    </button>
                                                    <button
                                                        className="snippet-action-btn danger"
                                                        onClick={() => handleDeleteCloudGist(page.name, page.gistId || '')}
                                                        title="刪除雲端 Gist (危險操作)"
                                                        style={{ marginLeft: '4px' }}
                                                    >
                                                        🗑️
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}

                {/* TODO Tab Content */}
                {activeTab === 'todo' && (
                    <>
                        <div style={{ padding: '8px 12px', backgroundColor: '#2a2826', borderBottom: '1px solid #3a3836', position: 'relative', zIndex: 1 }}>
                            <input
                                ref={todoInputRef}
                                type="text"
                                placeholder="輸入 TODO 標題後按 Enter 或點上方 +"
                                value={newTodoTitle}
                                onChange={e => setNewTodoTitle(e.target.value)}
                                onKeyPress={e => e.key === 'Enter' && handleAddTodo()}
                                autoComplete="off"
                                style={{
                                    width: '100%',
                                    padding: '8px 12px',
                                    backgroundColor: '#1f1d1a',
                                    border: '1px solid #3a3836',
                                    borderRadius: '4px',
                                    color: '#dfdbc3',
                                    fontSize: '12px',
                                    outline: 'none',
                                    boxSizing: 'border-box'
                                }}
                                onFocus={(e) => e.target.style.borderColor = '#7bbda4'}
                                onBlur={(e) => e.target.style.borderColor = '#3a3836'}
                            />
                        </div>

                        <div className="snippet-sidebar-list">
                            {todos.length === 0 ? (
                                <div className="snippet-empty">
                                    尚無 TODO
                                    <br />
                                    <small style={{ fontSize: '10px', color: '#888' }}>
                                        在上方輸入框新增 TODO 項目
                                    </small>
                                </div>
                            ) : (
                                todos.map(todo => (
                                    <div
                                        key={todo.id}
                                        className="snippet-sidebar-item"
                                        style={{ 
                                            opacity: todo.completed ? 0.6 : 1,
                                            borderLeft: `3px solid ${
                                                todo.priority === 'high' ? '#ef4444' : 
                                                todo.priority === 'medium' ? '#f59e0b' : 
                                                '#10b981'
                                            }`
                                        }}
                                    >
                                        <div className="snippet-item-main" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <input
                                                type="checkbox"
                                                checked={todo.completed}
                                                onChange={() => handleToggleTodo(todo.id)}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            <span 
                                                className="snippet-item-title" 
                                                style={{ 
                                                    textDecoration: todo.completed ? 'line-through' : 'none',
                                                    flex: 1
                                                }}
                                            >
                                                {todo.title}
                                            </span>
                                        </div>
                                        <div className="snippet-item-actions">
                                            <select
                                                value={todo.priority}
                                                onChange={e => handleChangePriority(todo.id, e.target.value as 'low' | 'medium' | 'high')}
                                                style={{
                                                    fontSize: '10px',
                                                    padding: '2px 4px',
                                                    background: 'var(--bg-tertiary)',
                                                    border: '1px solid var(--border-color)',
                                                    borderRadius: '3px',
                                                    color: 'var(--text-primary)',
                                                    cursor: 'pointer'
                                                }}
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <option value="low">低</option>
                                                <option value="medium">中</option>
                                                <option value="high">高</option>
                                            </select>
                                            <button
                                                className="snippet-action-btn danger"
                                                onClick={() => handleDeleteTodo(todo.id)}
                                                title="刪除"
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </>
                )}
            </aside>

            {/* Edit Dialog */}
            {(editingSnippet || isCreating) && (
                <EditDialog
                    snippet={editingSnippet}
                    isNew={isCreating}
                    onSave={(data) => {
                        if (isCreating) {
                            handleCreate(data)
                            setIsCreating(false)
                        } else if (editingSnippet) {
                            handleUpdate(editingSnippet.id, data)
                            setEditingSnippet(null)
                        }
                    }}
                    onClose={() => {
                        setEditingSnippet(null)
                        setIsCreating(false)
                    }}
                />
            )}

            {/* Wiki Edit Dialog */}
            {(editingWiki || isCreatingWiki) && (
                <WikiEditDialog
                    page={editingWiki}
                    isNew={isCreatingWiki}
                    onSave={(data) => {
                        if (isCreatingWiki) {
                            handleCreateWiki(data)
                            setIsCreatingWiki(false)
                        } else if (editingWiki) {
                            handleUpdateWiki(editingWiki.name, data)
                            setEditingWiki(null)
                        }
                    }}
                    onClose={() => {
                        setEditingWiki(null)
                        setIsCreatingWiki(false)
                    }}
                />
            )}

            {/* Input Dialog */}
            {inputDialog && (
                <InputDialog
                    title={inputDialog.title}
                    placeholder={inputDialog.placeholder}
                    defaultValue={inputDialog.defaultValue}
                    onConfirm={inputDialog.onConfirm}
                    onClose={() => setInputDialog(null)}
                />
            )}

            {/* Gist List Dialog */}
            {showGistList && (
                <GistListDialog
                    gists={gistList}
                    loading={gistListLoading}
                    onSelect={handleImportSingleGist}
                    onSelectAll={handleImportAllGists}
                    onClose={() => setShowGistList(false)}
                />
            )}
        </>
    )
}