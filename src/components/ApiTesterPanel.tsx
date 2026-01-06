import { useState, useEffect, useRef } from 'react'
import { workspaceStore } from '../stores/workspace-store'
import { settingsStore } from '../stores/settings-store'

interface ApiTesterPanelProps {
    isVisible: boolean
    onClose: () => void
    isFloating?: boolean
    collapsed?: boolean
    onCollapse?: () => void
    workspaceId?: string | null
}

interface RequestHeader {
    id: string
    key: string
    value: string
    enabled: boolean
}

interface RequestHistory {
    id: string
    method: string
    url: string
    timestamp: number
    status?: number
    duration?: number
}

interface PostmanCollection {
    info: {
        name: string
        description?: string
    }
    item: PostmanItem[]
    variable?: PostmanVariable[]
}

interface PostmanItem {
    name: string
    request?: PostmanRequest
    item?: PostmanItem[] // For folders
}

interface PostmanRequest {
    method: string
    header?: Array<{ key: string; value: string; disabled?: boolean }>
    url: string | { raw: string; host?: string[] }
    body?: {
        mode: string
        raw?: string
        formdata?: Array<{ key: string; value: string }>
    }
}

interface PostmanVariable {
    key: string
    value: string
}

interface SavedCollection {
    id: string
    name: string
    requests: Array<{
        id: string
        name: string
        method: string
        url: string
        headers: RequestHeader[]
        body: string
    }>
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export function ApiTesterPanel({ isVisible, onClose, isFloating = false, collapsed = false, onCollapse, workspaceId }: Readonly<ApiTesterPanelProps>) {
    const [isInternalFloating, setIsInternalFloating] = useState(() => {
        const saved = localStorage.getItem('api-tester-floating')
        return saved ? JSON.parse(saved) : false
    })
    
    // Use prop isFloating when in tab system, otherwise use internal state
    const effectiveFloating = isFloating || isInternalFloating
    
    // 取得共用/獨立狀態（即時計算）
    const settings = settingsStore.getSettings()
    const isShared = settings.sharedPanels?.api !== false
    const state = workspaceStore.getState()
    const currentWorkspace = state.workspaces.find(w => w.id === workspaceId)
    const workspaceName = currentWorkspace?.alias || currentWorkspace?.name || '未知工作區'
    const modeLabel = isShared ? '🌐 共用' : `🔒 ${workspaceName}`
    
    const [position, setPosition] = useState(() => {
        const saved = localStorage.getItem('api-tester-position')
        return saved ? JSON.parse(saved) : { x: 100, y: 100 }
    })
    
    const [size, setSize] = useState(() => {
        const saved = localStorage.getItem('api-tester-size')
        return saved ? JSON.parse(saved) : { width: 400, height: 700 }
    })

    const [zIndex, setZIndex] = useState(1000)

    const [method, setMethod] = useState<HttpMethod>('GET')
    const [url, setUrl] = useState('')
    const [headers, setHeaders] = useState<RequestHeader[]>([
        { id: '1', key: 'Content-Type', value: 'application/json', enabled: true }
    ])
    const [body, setBody] = useState('')
    const [response, setResponse] = useState<string>('')
    const [responseStatus, setResponseStatus] = useState<number | null>(null)
    const [responseTime, setResponseTime] = useState<number | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [history, setHistory] = useState<RequestHistory[]>(() => {
        const saved = localStorage.getItem('api-tester-history')
        return saved ? JSON.parse(saved) : []
    })
    const [collections, setCollections] = useState<SavedCollection[]>(() => {
        const saved = localStorage.getItem('api-tester-collections')
        return saved ? JSON.parse(saved) : []
    })
    const [showCollections, setShowCollections] = useState(false)
    const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'response'>('body')
    const isDragging = useRef(false)
    const dragOffset = useRef({ x: 0, y: 0 })

    // Handle drag start
    const handleDragStart = (e: React.MouseEvent) => {
        if (!effectiveFloating) return
        setZIndex(1001) // 置顶
        isDragging.current = true
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        }
    }

    // Handle drag move
    useEffect(() => {
        const handleDragMove = (e: MouseEvent) => {
            if (!isDragging.current) return
            setPosition({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y
            })
        }

        const handleDragEnd = () => {
            isDragging.current = false
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

    useEffect(() => {
        localStorage.setItem('api-tester-floating', JSON.stringify(isFloating))
    }, [isFloating])

    useEffect(() => {
        localStorage.setItem('api-tester-position', JSON.stringify(position))
    }, [position])

    useEffect(() => {
        localStorage.setItem('api-tester-size', JSON.stringify(size))
    }, [size])

    useEffect(() => {
        localStorage.setItem('api-tester-history', JSON.stringify(history))
    }, [history])

    const handleSendRequest = async () => {
        if (!url.trim()) {
            alert('請輸入 URL')
            return
        }

        setIsLoading(true)
        setResponse('')
        setResponseStatus(null)
        setResponseTime(null)

        const startTime = Date.now()

        try {
            const enabledHeaders = headers.filter(h => h.enabled && h.key.trim())
            const headerObj: Record<string, string> = {}
            enabledHeaders.forEach(h => {
                headerObj[h.key] = h.value
            })

            const options: RequestInit = {
                method,
                headers: headerObj
            }

            if (method !== 'GET' && method !== 'HEAD' && body.trim()) {
                options.body = body
            }

            const res = await fetch(url, options)
            const duration = Date.now() - startTime

            setResponseStatus(res.status)
            setResponseTime(duration)

            const contentType = res.headers.get('content-type')
            let responseText = ''

            if (contentType?.includes('application/json')) {
                const json = await res.json()
                responseText = JSON.stringify(json, null, 2)
            } else {
                responseText = await res.text()
            }

            setResponse(responseText)
            setActiveTab('response')

            // 添加到歷史記錄
            const newHistory: RequestHistory = {
                id: Date.now().toString(),
                method,
                url,
                timestamp: Date.now(),
                status: res.status,
                duration
            }
            setHistory(prev => [newHistory, ...prev].slice(0, 50)) // 保留最近 50 條

        } catch (error) {
            const duration = Date.now() - startTime
            setResponseTime(duration)
            setResponse(`❌ 錯誤: ${(error as Error).message}`)
            setActiveTab('response')
        } finally {
            setIsLoading(false)
        }
    }

    const handleAddHeader = () => {
        setHeaders(prev => [...prev, { id: Date.now().toString(), key: '', value: '', enabled: true }])
    }

    const handleRemoveHeader = (id: string) => {
        setHeaders(prev => prev.filter(h => h.id !== id))
    }

    const handleHeaderChange = (id: string, field: 'key' | 'value' | 'enabled', value: string | boolean) => {
        setHeaders(prev => prev.map(h => h.id === id ? { ...h, [field]: value } : h))
    }

    const handleLoadFromHistory = (item: RequestHistory) => {
        setMethod(item.method as HttpMethod)
        setUrl(item.url)
        setResponse('')
        setResponseStatus(null)
        setResponseTime(null)
    }

    const handleClearHistory = () => {
        if (confirm('確定要清除所有歷史記錄嗎？')) {
            setHistory([])
        }
    }

    const handleImportPostman = () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.json'
        input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0]
            if (!file) return

            const reader = new FileReader()
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target?.result as string)
                    const collection = parsePostmanCollection(json)
                    if (collection) {
                        setCollections(prev => {
                            const updated = [...prev, collection]
                            localStorage.setItem('api-tester-collections', JSON.stringify(updated))
                            return updated
                        })
                        setShowCollections(true)
                        alert(`✅ 成功導入 "${collection.name}"，共 ${collection.requests.length} 個請求`)
                    }
                } catch (error) {
                    alert(`❌ 導入失敗: ${(error as Error).message}`)
                }
            }
            reader.readAsText(file)
        }
        input.click()
    }

    const parsePostmanCollection = (json: PostmanCollection): SavedCollection | null => {
        try {
            const requests: SavedCollection['requests'] = []
            
            const parseItems = (items: PostmanItem[], prefix = '') => {
                items.forEach(item => {
                    if (item.request) {
                        const req = item.request
                        const requestUrl = typeof req.url === 'string' ? req.url : req.url.raw
                        const requestHeaders: RequestHeader[] = (req.header || []).map((h, idx) => ({
                            id: `${Date.now()}-${idx}`,
                            key: h.key,
                            value: h.value,
                            enabled: !h.disabled
                        }))
                        const requestBody = req.body?.mode === 'raw' ? req.body.raw || '' : ''
                        
                        requests.push({
                            id: `${Date.now()}-${requests.length}`,
                            name: prefix + item.name,
                            method: req.method.toUpperCase(),
                            url: requestUrl,
                            headers: requestHeaders,
                            body: requestBody
                        })
                    }
                    if (item.item) {
                        parseItems(item.item, prefix + item.name + ' > ')
                    }
                })
            }
            
            parseItems(json.item)
            
            return {
                id: Date.now().toString(),
                name: json.info.name,
                requests
            }
        } catch (error) {
            console.error('Parse error:', error)
            return null
        }
    }

    const loadRequest = (collectionId: string, requestId: string) => {
        const collection = collections.find(c => c.id === collectionId)
        const request = collection?.requests.find(r => r.id === requestId)
        if (request) {
            setMethod(request.method as HttpMethod)
            setUrl(request.url)
            setHeaders(request.headers)
            setBody(request.body)
            setResponse('')
            setResponseStatus(null)
            setResponseTime(null)
            setShowCollections(false)
        }
    }

    const deleteCollection = (collectionId: string) => {
        if (confirm('確定要刪除此集合嗎？')) {
            setCollections(prev => {
                const updated = prev.filter(c => c.id !== collectionId)
                localStorage.setItem('api-tester-collections', JSON.stringify(updated))
                return updated
            })
        }
    }

    if (!isVisible) return null

    // Collapsed state - show icon bar
    if (collapsed && onCollapse) {
        return (
            <div
                className="collapsed-bar collapsed-bar-right"
                onClick={onCollapse}
                title="展開 API 測試器"
                style={{ width: '40px' }}
            >
                <div className="collapsed-bar-icon">🌐</div>
            </div>
        )
    }

    const panelClass = effectiveFloating ? 'api-tester-panel floating' : 'api-tester-panel docked'
    const panelStyle = effectiveFloating 
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
            width: '100%',
            height: '100%',
            backgroundColor: '#1f1d1a',
            display: 'flex',
            flexDirection: 'column' as const,
            overflow: 'hidden'
          }

    return (
        <aside className={panelClass} style={panelStyle}>
            {/* Resize handle for docked mode - not needed as it's handled by parent ResizeHandle */}
            <div className="api-tester-header" onMouseDown={handleDragStart}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h3 style={{ margin: 0 }}>🌐 API</h3>
                    {/* 共用/獨立標籤 */}
                    <span style={{ 
                        fontSize: '11px', 
                        color: isShared ? '#7bbda4' : '#f59e0b',
                        backgroundColor: isShared ? '#2d4a2d' : '#3d2f1f',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        fontWeight: 'bold'
                    }}>
                        {modeLabel}
                    </span>
                </div>
                <div className="api-tester-controls">
                    <button
                        className="api-tester-toggle-btn"
                        onClick={handleImportPostman}
                        title="導入 Postman 集合"
                    >
                        📥
                    </button>
                    {/* Only show float/collapse buttons when not in tab system */}
                    {isFloating === undefined && (
                        <>
                            <button
                                className="api-tester-toggle-btn"
                                onClick={() => {
                                    setIsInternalFloating(!isInternalFloating)
                                    localStorage.setItem('api-tester-floating', JSON.stringify(!isInternalFloating))
                                }}
                                title={effectiveFloating ? '固定面板' : '浮動面板'}
                            >
                                {effectiveFloating ? '📌' : '🔗'}
                            </button>
                            {onCollapse && !effectiveFloating && (
                                <button
                                    className="api-tester-toggle-btn"
                                    onClick={onCollapse}
                                    title="收合面板"
                                    style={{ padding: '6px 12px' }}
                                >
                                    »
                                </button>
                            )}
                            <button className="api-tester-close-btn" onClick={onClose}>×</button>
                        </>
                    )}
                </div>
            </div>

            <div className="api-tester-body">
                {/* Left sidebar for collections and history */}
                <div className="api-tester-sidebar">
                    <div className="api-sidebar-tabs">
                        <button
                            className={!showCollections ? 'active' : ''}
                            onClick={() => setShowCollections(false)}
                        >
                            📜 歷史
                        </button>
                        <button
                            className={showCollections ? 'active' : ''}
                            onClick={() => setShowCollections(true)}
                        >
                            📚 集合 {collections.length > 0 && `(${collections.length})`}
                        </button>
                    </div>

                    {showCollections ? (
                        <div className="api-sidebar-content">
                            {collections.length === 0 ? (
                                <div style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '12px' }}>
                                    暫無集合<br/>點擊 📥 導入
                                </div>
                            ) : (
                                <div className="api-collections-list">
                                    {collections.map(collection => (
                                        <div key={collection.id} className="api-collection-group">
                                            <div className="api-collection-title">
                                                <span>📁 {collection.name}</span>
                                                <button 
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        deleteCollection(collection.id)
                                                    }}
                                                    style={{
                                                        marginLeft: 'auto',
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: '#ef4444',
                                                        cursor: 'pointer',
                                                        fontSize: '14px',
                                                        padding: '2px'
                                                    }}
                                                    title="刪除集合"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>
                                                {collection.requests.length} 個請求
                                            </div>
                                            {collection.requests.map(request => (
                                                <div
                                                    key={request.id}
                                                    className="api-sidebar-item"
                                                    onClick={() => loadRequest(collection.id, request.id)}
                                                >
                                                    <span className={`method method-${request.method.toLowerCase()}`}>
                                                        {request.method}
                                                    </span>
                                                    <span className="item-name">{request.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="api-sidebar-content">
                            {history.length === 0 ? (
                                <div className="api-history-empty">暫無記錄</div>
                            ) : (
                                history.map(item => (
                                    <div
                                        key={item.id}
                                        className="api-sidebar-item"
                                        onClick={() => handleLoadFromHistory(item)}
                                    >
                                        <span className={`method method-${item.method.toLowerCase()}`}>
                                            {item.method}
                                        </span>
                                        <span className="item-name">{item.url}</span>
                                        {item.status && (
                                            <span className={`status ${item.status < 400 ? 'success' : 'error'}`}>
                                                {item.status}
                                            </span>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>

                {/* Right panel for request editor */}
                <div className="api-tester-main">
            <div className="api-tester-request-line">
                <select 
                    className="api-method-select"
                    value={method} 
                    onChange={e => setMethod(e.target.value as HttpMethod)}
                >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                    <option value="HEAD">HEAD</option>
                    <option value="OPTIONS">OPTIONS</option>
                </select>
                <input
                    type="text"
                    className="api-url-input"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="輸入 URL (例如: https://api.example.com/data)"
                    onKeyDown={e => e.key === 'Enter' && handleSendRequest()}
                />
                <button
                    className="api-send-btn"
                    onClick={handleSendRequest}
                    disabled={isLoading}
                >
                    {isLoading ? '⏳' : '發送'}
                </button>
            </div>

            <div className="api-tester-tabs">
                <button
                    className={activeTab === 'body' ? 'active' : ''}
                    onClick={() => setActiveTab('body')}
                >
                    Body
                </button>
                <button
                    className={activeTab === 'headers' ? 'active' : ''}
                    onClick={() => setActiveTab('headers')}
                >
                    Headers ({headers.filter(h => h.enabled).length})
                </button>
                <button
                    className={activeTab === 'response' ? 'active' : ''}
                    onClick={() => setActiveTab('response')}
                >
                    Response
                    {responseStatus && (
                        <span className={`status-badge ${responseStatus < 400 ? 'success' : 'error'}`}>
                            {responseStatus}
                        </span>
                    )}
                </button>
            </div>

            <div className="api-tester-content">
                {activeTab === 'body' && (
                    <div className="api-body-panel">
                        <textarea
                            className="api-body-textarea"
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            placeholder='輸入請求內容 (例如 JSON):\n{\n  "key": "value"\n}'
                            disabled={method === 'GET' || method === 'HEAD'}
                        />
                    </div>
                )}

                {activeTab === 'headers' && (
                    <div className="api-headers-panel">
                        <div className="api-headers-list">
                            {headers.map(header => (
                                <div key={header.id} className="api-header-row">
                                    <input
                                        type="checkbox"
                                        checked={header.enabled}
                                        onChange={e => handleHeaderChange(header.id, 'enabled', e.target.checked)}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Key"
                                        value={header.key}
                                        onChange={e => handleHeaderChange(header.id, 'key', e.target.value)}
                                    />
                                    <input
                                        type="text"
                                        placeholder="Value"
                                        value={header.value}
                                        onChange={e => handleHeaderChange(header.id, 'value', e.target.value)}
                                    />
                                    <button onClick={() => handleRemoveHeader(header.id)}>🗑️</button>
                                </div>
                            ))}
                        </div>
                        <button className="api-add-header-btn" onClick={handleAddHeader}>
                            + 新增 Header
                        </button>
                    </div>
                )}

                {activeTab === 'response' && (
                    <div className="api-response-panel">
                        {responseStatus && (
                            <div className="api-response-meta">
                                <span className={`status-code ${responseStatus < 400 ? 'success' : 'error'}`}>
                                    Status: {responseStatus}
                                </span>
                                {responseTime && <span>Time: {responseTime}ms</span>}
                            </div>
                        )}
                        <pre className="api-response-content">{response || '尚未發送請求'}</pre>
                    </div>
                )}
            </div>
                </div>
            </div>
        </aside>
    )
}
