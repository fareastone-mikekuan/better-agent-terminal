import { useState, useEffect, useRef } from 'react'

interface ApiTesterPanelProps {
    isVisible: boolean
    onClose: () => void
    height?: number
    onResize?: (delta: number) => void
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

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

export function ApiTesterPanel({ isVisible, onClose, height = 300, onResize }: Readonly<ApiTesterPanelProps>) {
    const [isFloating, setIsFloating] = useState(() => {
        const saved = localStorage.getItem('api-tester-floating')
        return saved ? JSON.parse(saved) : false
    })
    
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
    const [activeTab, setActiveTab] = useState<'body' | 'headers' | 'response'>('body')
    const isDragging = useRef(false)
    const dragOffset = useRef({ x: 0, y: 0 })

    // Handle drag start
    const handleDragStart = (e: React.MouseEvent) => {
        if (!isFloating) return
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

    if (!isVisible) return null

    const panelClass = isFloating ? 'api-tester-panel floating' : 'api-tester-panel docked'
    const panelStyle = isFloating 
        ? { left: position.x, top: position.y, width: size.width, height: size.height, zIndex }
        : { width: height } // Using height prop as width for vertical panel

    return (
        <aside className={panelClass} style={panelStyle}>
            {/* Resize handle for docked mode - not needed as it's handled by parent ResizeHandle */}
            <div className="api-tester-header" onMouseDown={handleDragStart}>
                <h3>🌐 API</h3>
                <div className="api-tester-controls">
                    <button
                        className="api-tester-toggle-btn"
                        onClick={() => setIsFloating(!isFloating)}
                        title={isFloating ? '固定面板' : '浮動面板'}
                    >
                        {isFloating ? '📌' : '🔗'}
                    </button>
                    <button className="api-tester-close-btn" onClick={onClose}>×</button>
                </div>
            </div>

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

            <div className="api-tester-history">
                <div className="api-history-header">
                    <h4>📜 歷史記錄</h4>
                    <button onClick={handleClearHistory}>清除</button>
                </div>
                <div className="api-history-list">
                    {history.length === 0 ? (
                        <div className="api-history-empty">暫無記錄</div>
                    ) : (
                        history.map(item => (
                            <div
                                key={item.id}
                                className="api-history-item"
                                onClick={() => handleLoadFromHistory(item)}
                            >
                                <span className={`method method-${item.method.toLowerCase()}`}>
                                    {item.method}
                                </span>
                                <span className="url">{item.url}</span>
                                {item.status && (
                                    <span className={`status ${item.status < 400 ? 'success' : 'error'}`}>
                                        {item.status}
                                    </span>
                                )}
                                {item.duration && <span className="duration">{item.duration}ms</span>}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </aside>
    )
}
