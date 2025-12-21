# GitHub Copilot Integration Guide

## Overview

Better Agent Terminal now includes complete GitHub Copilot Chat integration! You can chat with GitHub Copilot directly in your terminal, alongside regular terminal sessions and Claude Code.

## Prerequisites

To use GitHub Copilot, you need:

1. **GitHub Copilot Business subscription** (recommended) or **GitHub Copilot Pro** subscription
2. A **GitHub Personal Access Token** with the `copilot` scope

## Getting Your GitHub Token

### Step 1: Create a Personal Access Token

1. Go to [GitHub Settings - Personal access tokens](https://github.com/settings/tokens)
2. Click **Generate new token** (classic)
3. Fill in the token details:
   - **Token name**: "Better Agent Terminal Copilot"
   - **Expiration**: 90 days (or as preferred)
   - **Scopes**: Select `copilot` (and optionally `repo` if you need repository access)
4. Click **Generate token**
5. **Copy the token immediately** (you won't see it again!)

### Step 2: Add Token to Better Agent Terminal

1. Open Better Agent Terminal
2. Click the **Settings** button (gear icon) in the sidebar
3. Scroll to **GitHub Copilot Configuration**
4. Paste your GitHub token in the **API Key** field
5. Optionally set your **Organization Slug** if using organization-managed Copilot
6. Toggle **Enable GitHub Copilot** to ON
7. Click **Save**

## Using GitHub Copilot

### Creating a Copilot Terminal

When you create a new workspace or open an existing one:

- If Copilot is enabled, the AI terminal will automatically be a **GitHub Copilot Chat** terminal (⚡ icon)
- If Copilot is disabled, it defaults to **Claude Code** (✦ icon)

### Switching Between AI Modes

You can have both Copilot and Claude Code terminals in the same workspace:

1. Close the current AI terminal
2. Go to Settings and toggle GitHub Copilot on/off
3. Create a new workspace - the new terminal will use the enabled AI mode

### Chatting with Copilot

In the Copilot Chat panel:

1. Type your question or coding task in the input box
2. Press **Enter** to send (or **Shift+Enter** for new lines)
3. Wait for Copilot's response
4. Continue the conversation as needed

**Example prompts:**
- "How do I reverse a string in JavaScript?"
- "Write a Python function to sort a list of dictionaries"
- "Explain what this code does: `const reduce = (arr, fn) => arr.reduce(fn);`"
- "Generate a regex pattern for email validation"

## Features

✨ **Smart AI Selection** - The app auto-detects and switches between Copilot and Claude Code based on your settings

🔄 **Persistent Sessions** - Switch between different terminals and workspaces without losing conversation history

⚡ **Real-time Streaming** - Get instant responses from GitHub Copilot (coming soon)

💾 **Conversation Memory** - Each chat session remembers the full conversation context

🎯 **Multi-workspace Support** - Run Copilot in multiple workspaces simultaneously

## API Limits

GitHub Copilot has usage limits:

- **Copilot Business**: Usually 50+ requests per day
- **Copilot Pro**: Usually 20+ requests per day
- Check your GitHub account for current limits

## Troubleshooting

### "GitHub Copilot API key is invalid or expired"

- Your token may have expired or been revoked
- Go to [GitHub Settings - Personal access tokens](https://github.com/settings/tokens) and check
- Generate a new token and update it in Settings

### "GitHub Copilot is not configured or enabled"

- Make sure you've toggled Copilot on in Settings
- Verify your API key is saved
- Restart the application

### Copilot Chat isn't responding

- Check your internet connection
- Verify your GitHub token is valid
- Check if you've exceeded your API rate limit for the day
- Try refreshing the application

## Privacy & Security

- Your GitHub token is stored locally in `~/.config/Better Agent Terminal/settings.json` (Linux/Mac) or `%APPDATA%\Better Agent Terminal\settings.json` (Windows)
- Never share your GitHub token with others
- If you suspect your token was leaked, immediately revoke it in GitHub Settings

## Limitations

- Copilot Chat currently operates in terminal/chat mode only (not integrated with actual terminal execution)
- Each message counts against your GitHub Copilot quota
- Responses are limited to 2048 tokens by default

## Integration Architecture

```
┌─────────────────────────────────────────────┐
│  React Frontend (CopilotPanel.tsx)          │
│  - Chat UI, message history, input box      │
└──────────────────────┬──────────────────────┘
                       │ IPC
┌──────────────────────▼──────────────────────┐
│  Electron Main Process (main.ts)            │
│  - IPC handlers: copilot:*                  │
└──────────────────────┬──────────────────────┘
                       │
┌──────────────────────▼──────────────────────┐
│  CopilotManager (copilot-manager.ts)        │
│  - GitHub Copilot API calls                 │
│  - Chat streaming support                   │
│  - Token management                         │
└──────────────────────┬──────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────┐
│  GitHub Copilot API Endpoint                │
│  api.github.com/copilot_internal/v2/...    │
└─────────────────────────────────────────────┘
```

## Future Enhancements

- [ ] Streaming responses for real-time output
- [ ] Code generation directly to terminal
- [ ] Context from current terminal session
- [ ] Chat history persistence
- [ ] Syntax highlighting in messages
- [ ] Keyboard shortcuts for quick prompts

## Support

If you encounter issues with GitHub Copilot integration:

1. Check this guide for solutions
2. Review your GitHub token permissions
3. Check GitHub's [Copilot documentation](https://github.com/features/copilot)
4. Open an issue on [GitHub](https://github.com/tony1223/better-agent-terminal/issues)
