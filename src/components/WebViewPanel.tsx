import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'

interface WebViewPanelProps {
  height: string
  url: string
  showToolbar?: boolean
  defaultZoom?: number
  partition?: string
  allowPopups?: boolean
  webPreferences?: string
  userAgent?: string
  isFloating?: boolean
  onToggleFloat?: () => void
  onClose?: () => void
  onContentChange?: (content: string) => void
  terminalId?: string
}

export interface WebViewPanelRef {
  fetchContent: () => Promise<string | null>
  fetchSelection: () => Promise<{ text: string; url?: string } | null>
}

export const WebViewPanel = forwardRef<WebViewPanelRef, WebViewPanelProps>(
  function WebViewPanel({ height, url: initialUrl, showToolbar = true, defaultZoom = 75, partition, allowPopups = false, webPreferences, userAgent, isFloating = false, onToggleFloat, onClose, onContentChange, terminalId }, ref) {
  const [zoom, setZoom] = useState(defaultZoom)
  const [currentUrl, setCurrentUrl] = useState(initialUrl)
  const [urlInput, setUrlInput] = useState(initialUrl)
  const [isFetching, setIsFetching] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const webviewRef = useRef<any>(null)
  const webviewDomReadyRef = useRef(false)
  const pendingZoomRef = useRef<number | null>(defaultZoom)

  const applyZoomToWebview = (targetZoom: number) => {
    const webview = webviewRef.current || containerRef.current?.querySelector('webview') as any
    if (!webview) return
    if (!webviewDomReadyRef.current) {
      pendingZoomRef.current = targetZoom
      return
    }
    const factor = Math.max(0.25, Math.min(2, targetZoom / 100))
    try {
      if (typeof webview.setZoomFactor === 'function') {
        webview.setZoomFactor(factor)
      } else if (typeof webview.setZoomLevel === 'function') {
        // Rough mapping: zoomFactor 1.0 ~ zoomLevel 0
        webview.setZoomLevel(Math.log(factor) / Math.log(1.2))
      }
    } catch (e) {
      console.warn('[WebView] Failed to apply zoom:', e)
    }
  }

  const normalizeWebUrl = (raw: string): string => {
    const trimmed = (raw || '').trim()
    if (!trimmed) return trimmed

    // Add https:// if no protocol specified
    const withProto = trimmed.match(/^https?:\/\//) ? trimmed : `https://${trimmed}`

    try {
      const u = new URL(withProto)

      // Teams: prefer the new web client to avoid the “classic Teams” landing page.
      // (We only rewrite obvious landing-style URLs; deep links should be left intact.)
      if (u.hostname === 'teams.microsoft.com') {
        const p = u.pathname || '/'
        const looksLikeLanding = p === '/' || p === '/_#/' || p.startsWith('/_#/') || p.startsWith('/_?') || p.startsWith('/_#')
        const alreadyV2 = p === '/v2' || p.startsWith('/v2/')
        if (looksLikeLanding && !alreadyV2) {
          return 'https://teams.microsoft.com/v2/'
        }
      }

      return u.toString()
    } catch {
      // If URL parsing fails, fall back to the raw-ish value.
      return withProto
    }
  }

  const getDefaultM365UserAgent = (): string => {
    // A conservative Chrome UA to avoid some sites blocking Electron.
    return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }

  const getEffectiveUserAgent = (finalUrl: string): string | undefined => {
    if (userAgent) return userAgent
    try {
      const u = new URL(finalUrl)
      const h = u.hostname
      const isM365 =
        h === 'outlook.office.com' ||
        h.endsWith('.office.com') ||
        h === 'office.com' ||
        h === 'www.microsoft365.com' ||
        h === 'microsoft365.com' ||
        h === 'm365.cloud.microsoft' ||
        h === 'login.microsoftonline.com' ||
        h === 'teams.microsoft.com' ||
        h === 'copilot.microsoft.com'
      return isM365 ? getDefaultM365UserAgent() : undefined
    } catch {
      return undefined
    }
  }

  // Dragging and resizing state
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('webview-position')
    return saved ? JSON.parse(saved) : { x: 20, y: 80 }
  })
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('webview-size')
    return saved ? JSON.parse(saved) : { width: 800, height: 600 }
  })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)

  // Handle URL navigation
  const handleNavigate = () => {
    if (urlInput.trim()) {
      const finalUrl = normalizeWebUrl(urlInput)
      setCurrentUrl(finalUrl)
      setUrlInput(finalUrl)
    }
  }

  // Handle refresh
  const handleRefresh = () => {
    if (webviewRef.current) {
      webviewRef.current.reload()
    }
  }

  // Fetch and save content function
  const fetchAndSaveContent = async (): Promise<string | null> => {
    const webview = webviewRef.current || containerRef.current?.querySelector('webview') as any
    if (!webview) {
      console.error('WebView element not found')
      return null
    }
    
    setIsFetching(true)
    try {
      // Wait a bit to ensure webview is ready
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const content = await webview.executeJavaScript(`
        (function() {
          try {
            // Try multiple ways to get content
            let text = '';
            
            // Method 1: innerText
            if (document.body.innerText) {
              text = document.body.innerText;
            }
            // Method 2: textContent
            else if (document.body.textContent) {
              text = document.body.textContent;
            }
            // Method 3: Get all text nodes
            else {
              const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null
              );
              const textNodes = [];
              while(walker.nextNode()) {
                textNodes.push(walker.currentNode.textContent);
              }
              text = textNodes.join(' ');
            }
            
            // Clean up whitespace
            text = text.replace(/\\s+/g, ' ').trim();
            
            // Limit size
            return text.substring(0, 50000);
          } catch (e) {
            return 'Error: ' + e.message;
          }
        })();
      `)
      
      if (content && content.length > 10 && !content.startsWith('Error:')) {
        if (onContentChange) {
          onContentChange(content)
        }
        console.log('[WebView] Content extracted, length:', content.length)
        setIsFetching(false)
        return content
      } else {
        console.warn('Content is empty or error:', content)
        setIsFetching(false)
        return null
      }
    } catch (e) {
      console.error('Failed to extract content:', e)
      setIsFetching(false)
      return null
    }
  }

  // Update URL input when initial URL changes
  useEffect(() => {
    const normalized = normalizeWebUrl(initialUrl)
    setCurrentUrl(normalized)
    setUrlInput(normalized)
    setLoadError(null)
    setIsLoading(true)
  }, [initialUrl])

  // Apply zoom using Electron's webview zoom APIs.
  // NOTE: CSS transforms on a <webview> container can cause a blank view on Windows.
  useEffect(() => {
    pendingZoomRef.current = zoom
    applyZoomToWebview(zoom)
  }, [zoom])

  // Auto-fetch content when webview loads
  useEffect(() => {
    if (!webviewRef.current) return

    const webview = webviewRef.current

    const handleDomReady = () => {
      webviewDomReadyRef.current = true
      const toApply = pendingZoomRef.current ?? zoom
      applyZoomToWebview(toApply)
    }
    
    const handleDidFinishLoad = () => {
      console.log('[WebView] Page loaded, auto-fetching content...')
      setLoadError(null)
      setIsLoading(false)

      // Ensure zoom is applied after navigation.
      applyZoomToWebview(zoom)

      // Auto-fetch content after page loads
      setTimeout(() => {
        if (onContentChange) {
          fetchAndSaveContent()
        }
      }, 2000) // Wait 2 seconds for JS to execute
    }

    const handleDidStartLoading = () => {
      setIsLoading(true)
    }

    const handleDidStopLoading = () => {
      setIsLoading(false)
    }

    const handleDidNavigate = (e: any) => {
      const nextUrl = e?.url
      if (typeof nextUrl === 'string' && nextUrl) {
        const normalized = normalizeWebUrl(nextUrl)
        setCurrentUrl(normalized)
        if (showToolbar) {
          setUrlInput(normalized)
        }
      }
    }

    const handleDidNavigateInPage = (e: any) => {
      const nextUrl = e?.url
      if (typeof nextUrl === 'string' && nextUrl) {
        const normalized = normalizeWebUrl(nextUrl)
        setCurrentUrl(normalized)
        if (showToolbar) {
          setUrlInput(normalized)
        }
      }
    }

    const handleDidFailLoad = (e: any) => {
      // Ignore benign aborts (e.g., navigation cancel)
      if (e?.errorCode === -3) return
      const desc = e?.errorDescription || 'Failed to load'
      const code = typeof e?.errorCode === 'number' ? ` (${e.errorCode})` : ''
      const failedUrl = e?.validatedURL || e?.url || ''
      const message = `${desc}${code}${failedUrl ? `: ${failedUrl}` : ''}`
      console.warn('[WebView] did-fail-load:', message)
      setLoadError(message)
    }

    const handleConsoleMessage = (e: any) => {
      // Helpful when a page fails silently.
      console.log('[WebView][console]', e?.level, e?.message)
    }

    const handleNewWindow = (e: any) => {
      const targetUrl = e?.url
      if (typeof targetUrl !== 'string' || !targetUrl) return

      // If popups are allowed, let Electron handle the new window (common for M365 login).
      if (allowPopups) return

      // Otherwise, keep navigation inside the same webview.
      try {
        e?.preventDefault?.()
      } catch {
        // ignore
      }

      const normalized = normalizeWebUrl(targetUrl)

      // Avoid calling webview.loadURL() here; it can generate noisy
      // 'GUEST_VIEW_MANAGER_CALL' ERR_ABORTED logs during auth redirects.
      setCurrentUrl(prev => {
        if (prev === normalized) return prev
        return normalized
      })
      if (showToolbar) setUrlInput(normalized)
    }

    // Reset dom-ready for each navigation lifecycle.
    webviewDomReadyRef.current = false
    webview.addEventListener('dom-ready', handleDomReady)
    webview.addEventListener('did-finish-load', handleDidFinishLoad)
    webview.addEventListener('did-start-loading', handleDidStartLoading)
    webview.addEventListener('did-stop-loading', handleDidStopLoading)
    webview.addEventListener('did-navigate', handleDidNavigate)
    webview.addEventListener('did-navigate-in-page', handleDidNavigateInPage)
    webview.addEventListener('did-fail-load', handleDidFailLoad)
    webview.addEventListener('console-message', handleConsoleMessage)
    webview.addEventListener('new-window', handleNewWindow)
    
    return () => {
      webview.removeEventListener('dom-ready', handleDomReady)
      webview.removeEventListener('did-finish-load', handleDidFinishLoad)
      webview.removeEventListener('did-start-loading', handleDidStartLoading)
      webview.removeEventListener('did-stop-loading', handleDidStopLoading)
      webview.removeEventListener('did-navigate', handleDidNavigate)
      webview.removeEventListener('did-navigate-in-page', handleDidNavigateInPage)
      webview.removeEventListener('did-fail-load', handleDidFailLoad)
      webview.removeEventListener('console-message', handleConsoleMessage)
      webview.removeEventListener('new-window', handleNewWindow)
    }
  }, [currentUrl, zoom, onContentChange, showToolbar, allowPopups])

  // Expose fetchContent method to parent
  useImperativeHandle(ref, () => ({
    fetchContent: fetchAndSaveContent,
    fetchSelection: async () => {
      const webview = webviewRef.current || containerRef.current?.querySelector('webview') as any
      if (!webview) return null

      try {
        const result = await webview.executeJavaScript(`
          (function() {
            try {
              var text = '';

              // Window selection (most page text)
              var sel = window.getSelection && window.getSelection();
              if (sel && sel.toString) {
                text = sel.toString();
              }

              // Input/textarea selection (chat boxes)
              if (!text) {
                var el = document.activeElement;
                if (el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'search' || el.type === 'email' || el.type === 'tel' || el.type === 'url' || el.type === 'password')))) {
                  var start = el.selectionStart;
                  var end = el.selectionEnd;
                  if (typeof start === 'number' && typeof end === 'number' && end > start) {
                    text = (el.value || '').substring(start, end);
                  }
                }
              }

              // Clean
              if (text) {
                text = String(text).replace(/\s+$/g, '').replace(/^\s+/g, '');
              }

              return { text: text || '', url: location && location.href ? String(location.href) : '' };
            } catch (e) {
              return { text: '', url: '' };
            }
          })();
        `)

        const text = (result?.text || '').toString().trim()
        const url = (result?.url || '').toString().trim()

        if (!text) return null
        return { text: text.substring(0, 20000), url }
      } catch (e) {
        console.warn('[WebView] Failed to fetch selection:', e)
        return null
      }
    }
  }), [onContentChange])

  // Save position and size to localStorage
  useEffect(() => {
    if (isFloating) {
      localStorage.setItem('webview-position', JSON.stringify(position))
    }
  }, [position, isFloating])

  useEffect(() => {
    if (isFloating) {
      localStorage.setItem('webview-size', JSON.stringify(size))
    }
  }, [size, isFloating])

  // Handle dragging
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStart.x
      const deltaY = e.clientY - dragStart.y
      
      setPosition(prev => ({
        x: Math.max(0, Math.min(window.innerWidth - size.width, prev.x + deltaX)),
        y: Math.max(0, Math.min(window.innerHeight - 100, prev.y + deltaY))
      }))
      
      setDragStart({ x: e.clientX, y: e.clientY })
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, dragStart, size.width])

  // Handle resizing
  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      
      const rect = containerRef.current.getBoundingClientRect()
      const newWidth = Math.max(400, e.clientX - rect.left)
      const newHeight = Math.max(300, e.clientY - rect.top)
      
      setSize({
        width: Math.min(newWidth, window.innerWidth - position.x),
        height: Math.min(newHeight, window.innerHeight - position.y)
      })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, position])

  const handleDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
  }

  const containerStyle: React.CSSProperties = isFloating ? {
    position: 'fixed',
    left: `${position.x}px`,
    top: `${position.y}px`,
    width: `${size.width}px`,
    height: `${size.height}px`,
    backgroundColor: '#1e1e1e',
    border: '1px solid #3a3836',
    borderRadius: '6px',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
    zIndex: 1002,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    cursor: isDragging ? 'move' : 'default'
  } : {
    width: '100%',
    height: height,
    backgroundColor: showToolbar ? '#1e1e1e' : '#ffffff',
    borderTop: showToolbar ? '1px solid #3a3836' : 'none',
    borderLeft: showToolbar ? '1px solid #3a3836' : 'none',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flexShrink: 0
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      {/* Header */}
      {showToolbar && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: '#2a2826',
            borderBottom: '1px solid #3a3836',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            userSelect: 'none',
            cursor: isFloating ? 'move' : 'default'
          }}
          onMouseDown={isFloating ? handleDragStart : undefined}
        >
          <span style={{ color: '#dfdbc3', fontSize: '12px', fontWeight: 500 }}>🌐</span>
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleNavigate()
              }
            }}
            placeholder="輸入網址..."
            style={{
              flex: 1,
              padding: '4px 8px',
              fontSize: '12px',
              backgroundColor: '#1f1d1a',
              color: '#dfdbc3',
              border: '1px solid #3a3836',
              borderRadius: '4px',
              outline: 'none'
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
          <button
            onClick={handleNavigate}
            style={{
              background: 'none',
              border: '1px solid #3a3836',
              color: '#7bbda4',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '4px',
              fontWeight: 'bold'
            }}
            title="前往"
          >
            GO
          </button>
          <button
            onClick={handleRefresh}
            style={{
              background: 'none',
              border: '1px solid #3a3836',
              color: '#dfdbc3',
              cursor: 'pointer',
              padding: '4px 8px',
              fontSize: '12px',
              borderRadius: '4px'
            }}
            title="重新整理"
          >
            🔄
          </button>
          <button
            onClick={() => setZoom(Math.max(25, zoom - 10))}
            style={{
              background: 'none',
              border: '1px solid #3a3836',
              color: '#dfdbc3',
              cursor: 'pointer',
              padding: '2px 8px',
              fontSize: '14px',
              borderRadius: '4px'
            }}
            title="縮小"
          >
            −
          </button>
          <span style={{ color: '#dfdbc3', fontSize: '11px', minWidth: '45px', textAlign: 'center' }}>{zoom}%</span>
          <button
            onClick={() => setZoom(Math.min(200, zoom + 10))}
            style={{
              background: 'none',
              border: '1px solid #3a3836',
              color: '#dfdbc3',
              cursor: 'pointer',
              padding: '2px 8px',
              fontSize: '14px',
              borderRadius: '4px'
            }}
            title="放大"
          >
            +
          </button>
          <button
            onClick={() => setZoom(100)}
            style={{
              background: 'none',
              border: '1px solid #3a3836',
              color: '#dfdbc3',
              cursor: 'pointer',
              padding: '2px 8px',
              fontSize: '11px',
              borderRadius: '4px'
            }}
            title="重置"
          >
            100%
          </button>
          {onToggleFloat && (
            <button
              onClick={onToggleFloat}
              style={{
                background: 'none',
                border: '1px solid #3a3836',
                color: '#dfdbc3',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '12px',
                borderRadius: '4px'
              }}
              title={isFloating ? '固定' : '浮動'}
            >
              {isFloating ? '📌' : '🔗'}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: '1px solid #3a3836',
                color: '#dfdbc3',
                cursor: 'pointer',
                padding: '4px 8px',
                fontSize: '12px',
                borderRadius: '4px'
              }}
              title="關閉"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* WebView */}
      <div style={{ flex: 1, position: 'relative', backgroundColor: '#ffffff', overflow: 'auto' }}>
        {isLoading && !loadError && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 2,
            background: 'rgba(255,255,255,0.6)',
            color: '#333',
            fontSize: '12px'
          }}>
            <div>載入中…</div>
          </div>
        )}
        {loadError && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
            zIndex: 2,
            background: 'rgba(255,255,255,0.96)',
            color: '#333',
            fontSize: '12px',
            textAlign: 'center'
          }}>
            <div>
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>⚠️</div>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>頁面載入失敗</div>
              <div style={{ opacity: 0.8, wordBreak: 'break-word' }}>{loadError}</div>
            </div>
          </div>
        )}
        <webview
          ref={webviewRef}
          src={currentUrl}
          data-terminal-id={terminalId}
          partition={partition}
          allowpopups={allowPopups ? 'true' : undefined}
          webpreferences={webPreferences}
          useragent={getEffectiveUserAgent(currentUrl)}
          style={{
            width: '100%',
            height: '100%',
            border: 'none'
          }}
        />
      </div>
      
      {/* Resize Handle (only show when floating) */}
      {isFloating && (
        <div
          onMouseDown={handleResizeStart}
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: '20px',
            height: '20px',
            cursor: 'nwse-resize',
            background: 'linear-gradient(135deg, transparent 50%, #3a3836 50%)',
            borderBottomRightRadius: '6px'
          }}
          title="拖動調整大小"
        />
      )}
    </div>
  )
})
