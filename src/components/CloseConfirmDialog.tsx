interface CloseConfirmDialogProps {
  onConfirm: () => void
  onCancel: () => void
  terminalType?: 'claude-code' | 'copilot'
}

export function CloseConfirmDialog({ onConfirm, onCancel, terminalType = 'copilot' }: CloseConfirmDialogProps) {
  const isGitHubCopilot = terminalType === 'copilot'
  const title = isGitHubCopilot ? 'Close GitHub Copilot?' : 'Close Claude Code?'
  const description = isGitHubCopilot 
    ? 'Are you sure you want to close the GitHub Copilot terminal? Any running process will be terminated.'
    : 'Are you sure you want to close the Claude Code terminal? Any running process will be terminated.'

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="dialog-actions">
          <button className="dialog-btn cancel" onClick={onCancel}>
            Cancel
          </button>
          <button className="dialog-btn confirm" onClick={onConfirm}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
