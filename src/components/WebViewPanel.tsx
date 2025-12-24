import { useState } from 'react'

interface WebViewPanelProps {
  height: string
  url: string
}

export function WebViewPanel({ height, url }: WebViewPanelProps) {
  const [zoom, setZoom] = useState(40)

  return (
    <div
      style={{
        width: '100%',
        height: height,
        backgroundColor: '#1e1e1e',
        borderTop: '1px solid #3a3836',
        borderLeft: '1px solid #3a3836',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '8px 12px',
          backgroundColor: '#2a2826',
          borderBottom: '1px solid #3a3836',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          userSelect: 'none'
        }}
      >
        <span style={{ color: '#dfdbc3', fontSize: '12px', fontWeight: 500, flex: 1 }}>🌐 網頁視窗</span>
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
      </div>

      {/* WebView */}
      <div style={{ flex: 1, position: 'relative', backgroundColor: '#ffffff', overflow: 'auto' }}>
        <div style={{
          transform: `scale(${zoom / 100})`,
          transformOrigin: 'top left',
          width: `${10000 / zoom}%`,
          height: `${10000 / zoom}%`
        }}>
          <iframe
            src={url}
            style={{
              width: '100%',
              height: '100%',
              border: 'none'
            }}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
          />
        </div>
      </div>
    </div>
  )
}
