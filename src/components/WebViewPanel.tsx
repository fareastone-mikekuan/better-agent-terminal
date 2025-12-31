import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react'

interface WebViewPanelProps {
  height: string
  url: string
  isFloating?: boolean
  onToggleFloat?: () => void
  onClose?: () => void
  onContentChange?: (content: string) => void
  terminalId?: string
}

export interface WebViewPanelRef {
  fetchContent: () => Promise<string | null>
}

export const WebViewPanel = forwardRef<WebViewPanelRef, WebViewPanelProps>(
  function WebViewPanel({ height, url: initialUrl, isFloating = false, onToggleFloat, onClose, onContentChange, terminalId }, ref) {
  const [zoom, setZoom] = useState(75)
  const [currentUrl, setCurrentUrl] = useState(initialUrl)
  const [urlInput, setUrlInput] = useState(initialUrl)
  const [isFetching, setIsFetching] = useState(false)
  const webviewRef = useRef<any>(null)

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
      let finalUrl = urlInput.trim()
      // Add https:// if no protocol specified
      if (!finalUrl.match(/^https?:\/\//)) {
        finalUrl = 'https://' + finalUrl
      }
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
    setCurrentUrl(initialUrl)
    setUrlInput(initialUrl)
  }, [initialUrl])

  // Auto-fetch content when webview loads
  useEffect(() => {
    if (!webviewRef.current) return

    const webview = webviewRef.current
    
    const handleDidFinishLoad = () => {
      console.log('[WebView] Page loaded, auto-fetching content...')
      // Auto-fetch content after page loads
      setTimeout(() => {
        fetchAndSaveContent()
      }, 2000) // Wait 2 seconds for JS to execute
    }

    webview.addEventListener('did-finish-load', handleDidFinishLoad)
    
    return () => {
      webview.removeEventListener('did-finish-load', handleDidFinishLoad)
    }
  }, [currentUrl])

  // Expose fetchContent method to parent
  useImperativeHandle(ref, () => ({
    fetchContent: fetchAndSaveContent
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
    backgroundColor: '#1e1e1e',
    borderTop: '1px solid #3a3836',
    borderLeft: '1px solid #3a3836',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    flexShrink: 0
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      {/* Header */}
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

      {/* WebView */}
      <div style={{ flex: 1, position: 'relative', backgroundColor: '#ffffff', overflow: 'auto' }}>
        <div style={{
          transform: `scale(${zoom / 100})`,
          transformOrigin: 'top left',
          width: `${10000 / zoom}%`,
          height: `${10000 / zoom}%`
        }}>
          <webview
            ref={webviewRef}
            src={currentUrl}
            data-terminal-id={terminalId}
            style={{
              width: '100%',
              height: '100%',
              border: 'none'
            }}
          />
        </div>
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
