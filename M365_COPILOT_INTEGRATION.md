# M365 Copilot 集成方案

## ✅ 已完成的修改

### 1. 类型定义 (types/index.ts)

```typescript
export type CopilotProvider = 'github' | 'm365'

export interface CopilotConfig {
  enabled: boolean;
  provider: CopilotProvider; // 新增：选择使用哪个 Copilot
  
  // GitHub Copilot（原有）
  apiKey: string;
  organizationSlug?: string;
  model?: string;
  
  // M365 Copilot（新增）
  m365Config?: {
    tenantId: string;
    clientId: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpiry?: number;
    endpoint?: string;
  };
}
```

## 🔨 需要继续实现的部分

### 2. 设置界面 (SettingsPanel.tsx)

**添加 Provider 选择器：**

```tsx
{/* Provider Selector */}
{copilotConfig.enabled && (
  <div className="settings-group">
    <label>🔌 Copilot 來源</label>
    <div style={{ display: 'flex', gap: '10px' }}>
      <button
        onClick={() => handleCopilotProviderChange('github')}
        style={{
          backgroundColor: copilotConfig.provider === 'github' ? '#2d4a2d' : '#2a2826',
          ...
        }}
      >
        🐙 GitHub Copilot
      </button>
      <button
        onClick={() => handleCopilotProviderChange('m365')}
        style={{
          backgroundColor: copilotConfig.provider === 'm365' ? '#2d4a2d' : '#2a2826',
          ...
        }}
      >
        🟦 M365 Copilot
      </button>
    </div>
  </div>
)}

{/* GitHub Config */}
{copilotConfig.provider === 'github' && (
  // 原有的 GitHub 登录和设置
)}

{/* M365 Config */}
{copilotConfig.provider === 'm365' && (
  <div className="settings-group">
    <h4>M365 Copilot 設定</h4>
    
    {/* Tenant ID */}
    <input
      placeholder="Tenant ID"
      value={copilotConfig.m365Config?.tenantId || ''}
      onChange={e => handleM365ConfigChange('tenantId', e.target.value)}
    />
    
    {/* Client ID */}
    <input
      placeholder="Client ID"
      value={copilotConfig.m365Config?.clientId || ''}
      onChange={e => handleM365ConfigChange('clientId', e.target.value)}
    />
    
    {/* Login Button */}
    <button onClick={handleM365Login}>
      🔐 使用 Microsoft 帳號登入
    </button>
    
    {/* Login Status */}
    {copilotConfig.m365Config?.accessToken && (
      <div>✅ 已登入 M365 Copilot</div>
    )}
  </div>
)}
```

### 3. 后端管理 (copilot-manager.ts)

**扩展 CopilotManager：**

```typescript
export class CopilotManager {
  // 现有的 GitHub 相关代码保持不变
  
  // 新增：M365 OAuth 流程
  async startM365OAuth(tenantId: string, clientId: string): Promise<void> {
    const authUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?` +
      `client_id=${clientId}&` +
      `response_type=code&` +
      `redirect_uri=http://localhost:3000/callback&` +
      `scope=https://api.businesscentral.dynamics.com/.default`
    
    // 打开浏览器窗口
    const authWindow = new BrowserWindow({
      width: 800,
      height: 600,
      webPreferences: { nodeIntegration: false }
    })
    
    authWindow.loadURL(authUrl)
    
    // 监听回调
    authWindow.webContents.on('will-redirect', async (event, url) => {
      if (url.startsWith('http://localhost:3000/callback')) {
        const code = new URL(url).searchParams.get('code')
        await this.exchangeM365Code(code, tenantId, clientId)
        authWindow.close()
      }
    })
  }
  
  // 交换 token
  async exchangeM365Code(code: string, tenantId: string, clientId: string) {
    // 实现 token 交换逻辑
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`
    // POST 请求获取 access_token 和 refresh_token
  }
  
  // 调用 M365 Copilot API
  async callM365Copilot(options: CopilotChatOptions): Promise<CopilotChatResponse> {
    const endpoint = this.config?.m365Config?.endpoint || 
                    'https://api.m365copilot.microsoft.com/v1/chat'
    
    // 实现 M365 API 调用
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config?.m365Config?.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: options.messages,
        // M365 特定参数
      })
    })
    
    return await response.json()
  }
  
  // 修改现有的 chat 方法，根据 provider 分发
  async chat(options: CopilotChatOptions): Promise<CopilotChatResponse> {
    if (!this.config?.enabled) {
      throw new Error('Copilot not enabled')
    }
    
    // 根据 provider 选择调用哪个 API
    if (this.config.provider === 'm365') {
      return await this.callM365Copilot(options)
    } else {
      return await this.callGitHubCopilot(options) // 原有逻辑
    }
  }
}
```

### 4. 前端 IPC (electron/preload.ts)

**添加 M365 相关方法：**

```typescript
copilot: {
  // 现有方法保持不变
  setConfig: (config: CopilotConfig) => ipcRenderer.invoke('copilot:setConfig', config),
  chat: (options: CopilotChatOptions) => ipcRenderer.invoke('copilot:chat', options),
  
  // 新增：M365 OAuth
  startM365OAuth: (tenantId: string, clientId: string) => 
    ipcRenderer.invoke('copilot:m365-oauth', tenantId, clientId),
}
```

### 5. 主进程处理 (electron/main.ts)

**注册 M365 OAuth handler：**

```typescript
ipcMain.handle('copilot:m365-oauth', async (event, tenantId, clientId) => {
  return await copilotManager.startM365OAuth(tenantId, clientId)
})
```

## 🚀 实现步骤

1. ✅ **类型定义** - 已完成
2. **设置界面** - 添加 provider 选择器和 M365 配置表单
3. **OAuth 流程** - 实现 Microsoft 登录
4. **API 调用** - 实现 M365 Copilot API 集成
5. **测试** - 确保两个 provider 可以正常切换

## 📝 使用流程

### GitHub Copilot（现有）
1. 设置 → 启用 Copilot
2. 选择 "🐙 GitHub"
3. 使用 Device Flow 或 API Key 登录

### M365 Copilot（新增）
1. 设置 → 启用 Copilot
2. 选择 "🟦 M365"
3. 输入 Tenant ID 和 Client ID
4. 点击 "使用 Microsoft 帐号登入"
5. 完成 OAuth 授权

## 🔧 M365 Copilot API 端点

需要确认的信息：
- **API Endpoint**: `https://api.m365copilot.microsoft.com/v1/chat` (需要确认)
- **OAuth Scope**: 需要的具体权限范围
- **Request/Response 格式**: 是否与 GitHub Copilot 兼容

## ⚠️ 注意事项

1. **Token 存储**：M365 token 应该安全存储（使用 electron-store 加密）
2. **Token 刷新**：实现自动 refresh token 机制
3. **错误处理**：不同 provider 可能有不同的错误格式
4. **UI 提示**：清楚标示当前使用的是哪个 Copilot

## 🎯 后续优化

- [ ] 支持同时配置两个 provider，可快速切换
- [ ] 添加 provider 特定的设置（如 GitHub 的 model 选择）
- [ ] 统一两个 provider 的响应格式
- [ ] 添加使用统计和配额显示
