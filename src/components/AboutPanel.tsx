interface AboutPanelProps {
  onClose: () => void
}

export function AboutPanel({ onClose }: AboutPanelProps) {
  const handleLinkClick = (url: string) => {
    window.electronAPI.shell.openExternal(url)
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel about-panel" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h2>關於</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="settings-content about-content">
          <div className="about-logo">
            <span className="about-icon">⬛</span>
            <h1>AI維運平台</h1>
          </div>

          <p className="about-description">
            提供先進的終端機整合平台，整合 GitHub Copilot 智慧小助手。
          </p>

          <div className="about-info">
            <div className="about-row">
              <span className="about-label">作者</span>
              <span className="about-value">TonyQ、Mike Kuan</span>
            </div>
            <div className="about-row">
              <span className="about-label">GitHub</span>
              <a
                href="#"
                className="about-link"
                onClick={(e) => {
                  e.preventDefault()
                  handleLinkClick('https://github.com/fareastone-mikekuan/better-agent-terminal')
                }}
              >
                github.com/fareastone-mikekuan/better-agent-terminal
              </a>
            </div>
          </div>

          <div className="about-credits">
            <p>使用 Electron、React 和 xterm.js 構建</p>
          </div>
        </div>
      </div>
    </div>
  )
}
