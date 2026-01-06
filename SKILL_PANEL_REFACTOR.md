# 技能系統重構說明

## 概述

重新設計了技能系統的操作邏輯，使其更加直觀和實用。

## 新架構

### 1. 技能庫 (SkillLibraryPanel)
- **位置**: 左側 Sidebar 的「📚 技能庫」按鈕
- **功能**: 管理所有技能
  - 新增技能
  - 編輯技能配置
  - 刪除技能
  - 複製技能
  - 瀏覽所有可用技能

### 2. 技能面板 (SkillPanel)
- **位置**: 獨立右側面板，位於 CHAT 和筆記之間
- **功能**: 在當前工作區執行技能
  - 顯示所有可用技能列表
  - 搜尋和篩選技能（按標籤）
  - 在當前工作區執行選定的技能
  - 查看技能詳情

### 3. 控制按鈕
- **位置**: 左側 Sidebar 底部
- **順序**: 
  1. ⚡ AI (Copilot Chat)
  2. 🎯 技能 (Skill Panel)
  3. 📋 筆記 (Snippets)

## 使用流程

1. **管理技能**
   - 點擊 Sidebar 的「📚 技能庫」按鈕
   - 新增、編輯或刪除技能
   - 關閉技能庫

2. **使用技能**
   - 選擇一個工作區（在左側列表中點擊）
   - 點擊「🎯 技能」按鈕打開技能面板
   - 瀏覽或搜尋所需的技能
   - 點擊「▶ 執行」運行技能
   - 技能創建的所有終端機標籤會自動歸屬於當前工作區

## 技術實現

### 面板佈局順序
```
[Sidebar] | [Main Content] | [Chat Panel] | [Skill Panel] | [Notes Panel]
```

### 關鍵組件

1. **SkillPanel.tsx**
   - 新建的獨立技能執行面板
   - 接收 `workspaceId` 確保在正確的工作區執行
   - 支持收合/展開狀態
   - 可調整寬度（250-500px，默認 320px）

2. **App.tsx 修改**
   - 添加 `showSkill` 和 `skillWidth` 狀態
   - 添加 `skill` 到 `PanelSettings` 接口
   - 在 CHAT 和 Notes 之間渲染 SkillPanel
   - 傳遞正確的 `workspaceId` 和 `onExecuteWorkflow` 回調

3. **Sidebar.tsx 修改**
   - 添加 `showSkill` 和 `onToggleSkill` props
   - 在 AI 按鈕後添加技能按鈕
   - 按鈕狀態會顯示綠色（開啟）或紅色（關閉）邊框

4. **WorkflowExecutor.tsx**
   - 已經正確接收 `workspaceId`
   - 通過 `createPanelForStep(workspaceId, step, index)` 創建面板
   - 確保所有工作流程步驟在指定工作區執行

5. **workflow-panel-service.ts**
   - 已經正確處理 `workspaceId` 參數
   - 將其傳遞給 App.tsx 註冊的回調函數
   - 面板創建邏輯確保終端機歸屬正確的工作區

## 優點

1. **清晰分離**: 技能管理（技能庫）和技能執行（技能面板）功能分離
2. **工作區隔離**: 技能執行的終端機標籤只會出現在當前工作區，不影響其他工作區
3. **直觀操作**: 用戶可以清楚看到當前在哪個工作區執行哪個技能
4. **一致性**: 面板佈局與 CHAT、筆記面板保持一致的設計風格
5. **靈活性**: 支持收合、調整大小等交互功能

## 配置持久化

面板設置保存在 localStorage 中：
- `better-terminal-panel-settings`: 包含所有面板的收合狀態
- `skill-width`: 技能面板的寬度設置

## 未來擴展

可以考慮添加：
- 技能執行歷史記錄
- 技能收藏功能
- 技能執行快捷鍵
- 技能參數自定義輸入
