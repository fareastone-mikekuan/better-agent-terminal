# 技能工作區功能整合檢查清單

## 已完成
- ✅ Workspace 資料結構擴展（isSkill, skillConfig）
- ✅ WorkspaceConfigDialog 組件（技能配置對話框）
- ✅ SkillLibraryPanel 組件（技能庫面板）

## 待整合到 App.tsx

### 1. Import 新組件
```tsx
import { WorkspaceConfigDialog } from './components/WorkspaceConfigDialog'
import { SkillLibraryPanel } from './components/SkillLibraryPanel'
```

### 2. State 管理
```tsx
const [showConfigDialog, setShowConfigDialog] = useState<string | null>(null) // workspace id
const [showSkillLibrary, setShowSkillLibrary] = useState(false)
```

### 3. Handler 函數
```tsx
const handleUpdateWorkspaceConfig = useCallback((workspaceId: string, updates: Partial<Workspace>) => {
  workspaceStore.updateWorkspace(workspaceId, updates)
}, [])

const handleDuplicateSkill = useCallback(async (workspaceId: string) => {
  const workspace = state.workspaces.find(ws => ws.id === workspaceId)
  if (!workspace) return
  
  // 複製技能工作區邏輯
  const folderPath = await window.electronAPI.selectFolder()
  if (!folderPath) return
  
  const newWorkspace = {
    ...workspace,
    id: Date.now().toString(),
    folderPath,
    createdAt: Date.now()
  }
  
  workspaceStore.addWorkspace(newWorkspace)
}, [state.workspaces])
```

### 4. Sidebar 整合
在 Sidebar 組件新增：
- 「📚 技能庫」按鈕
- 工作區右鍵選單新增「⚙ 配置」選項

### 5. 面板切換邏輯
```tsx
{showSkillLibrary && (
  <SkillLibraryPanel
    workspaces={state.workspaces}
    activeWorkspaceId={state.activeWorkspaceId}
    onOpenSkill={(id) => {
      workspaceStore.setActiveWorkspace(id)
      setShowSkillLibrary(false)
    }}
    onEditSkill={(id) => setShowConfigDialog(id)}
    onDuplicateSkill={handleDuplicateSkill}
    onDeleteSkill={(id) => workspaceStore.removeWorkspace(id)}
  />
)}
```

### 6. 配置對話框
```tsx
{showConfigDialog && (
  <WorkspaceConfigDialog
    workspace={state.workspaces.find(ws => ws.id === showConfigDialog)!}
    onSave={(updates) => handleUpdateWorkspaceConfig(showConfigDialog, updates)}
    onClose={() => setShowConfigDialog(null)}
  />
)}
```

## electron API 需要新增的方法

### main.ts 或 preload.ts
```typescript
// 寫入檔案
writeFile: (path: string, content: string) => ipcRenderer.invoke('write-file', path, content)

// 執行命令（在特定工作區的終端）
executeCommand: (workspaceId: string, command: string) => 
  ipcRenderer.invoke('execute-command', workspaceId, command)
```

## Copilot 整合 skill.md

在 CopilotChatPanel 中，當發送訊息時：
```tsx
// 檢查當前工作區是否為技能
const currentWorkspace = workspaces.find(ws => ws.id === activeWorkspaceId)
if (currentWorkspace?.isSkill) {
  // 讀取 skill.md
  const skillMdPath = `${currentWorkspace.folderPath}/skill.md`
  const skillContent = await window.electronAPI.readFile(skillMdPath)
  
  // 將 skill.md 內容加入系統提示詞
  const systemPrompt = `你正在協助使用者執行以下技能：\n\n${skillContent}\n\n`
}
```

## 測試檢查清單
- [ ] 新增工作區並標記為技能
- [ ] 編輯技能配置（描述、標籤、快捷操作）
- [ ] 創建 skill.md 模板
- [ ] 技能庫面板顯示所有技能
- [ ] 搜尋和標籤篩選
- [ ] 點擊技能快捷操作執行命令
- [ ] Copilot 讀取 skill.md 上下文
