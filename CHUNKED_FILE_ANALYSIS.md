# 大文件分段分析功能說明

## 功能概述

當用戶上傳大型文件（超過 8000 字元）進行 AI 分析時，系統會自動將文件分段處理，避免單次請求內容過長而中斷分析。

## 實作細節

### 1. 文件大小檢測
- **觸發閾值**: 8000 字元
- **分段邏輯**: 當文件內容超過 8000 字元時，自動啟動分段處理

### 2. 分段處理流程

#### 第一階段：文件加載
```typescript
// 文件加載時檢測大小並分段
const CHUNK_SIZE = 8000
const needsChunking = fileContent.length > CHUNK_SIZE

if (needsChunking) {
  const chunks: string[] = []
  let offset = 0
  while (offset < fileContent.length) {
    chunks.push(fileContent.slice(offset, offset + CHUNK_SIZE))
    offset += CHUNK_SIZE
  }
  setFileChunks({ chunks, fileName, currentIndex: 0 })
}
```

#### 第二階段：逐段發送
- **第一段**: 包含用戶問題 + 內容第一部分
  ```
  請分析以下文件內容（檔案名，第 1/5 部分）：
  
  [內容第一段]
  
  我的問題：[用戶問題]
  
  ⚠️ 注意：這是大文件的第一部分，後續還有 4 個部分，請先分析這部分內容。
  ```

- **後續段落**: 自動繼續分析
  ```
  繼續分析文件（檔案名，第 2/5 部分）：
  
  [內容第二段]
  
  請基於之前的分析繼續處理這部分內容。
  ```

- **最後一段**: 提供總結提示
  ```
  繼續分析文件（檔案名，第 5/5 部分）：
  
  [內容最後段]
  
  請基於之前的分析繼續處理這部分內容。
  
  ✅ 這是最後一部分，請提供完整的分析結論。
  ```

#### 第三階段：自動繼續
```typescript
// AI 回應完成後，自動檢查是否有後續分段
if (hasMoreChunks.current) {
  setTimeout(() => {
    handleSendMessage() // 自動發送下一段
  }, 1500)
}
```

### 3. UI 顯示

#### 進度指示器
```tsx
{fileChunks && (
  <div className="copilot-data-loaded-hint">
    ✅ 已讀取文件（{fileChunks.fileName}）- 第 {fileChunks.currentIndex + 1}/{fileChunks.chunks.length} 部分，請輸入您的問題
  </div>
)}
```

### 4. 狀態管理

#### 主要狀態
- `fileChunks`: 存儲分段信息
  ```typescript
  {
    chunks: string[]      // 所有分段內容
    fileName: string      // 文件名
    currentIndex: number  // 當前處理到第幾段
  }
  ```

- `hasMoreChunks`: ref 用於追蹤是否有後續分段
  ```typescript
  const hasMoreChunks = useRef(false)
  ```

#### 狀態更新
```typescript
// 處理當前分段後更新狀態
if (fileChunks.currentIndex < fileChunks.chunks.length - 1) {
  setFileChunks({
    ...fileChunks,
    currentIndex: fileChunks.currentIndex + 1
  })
  hasMoreChunks.current = true
} else {
  setFileChunks(null)
  hasMoreChunks.current = false
}
```

## 使用體驗

### 用戶視角
1. **上傳大文件**：拖放或選擇文件
2. **看到進度**：「已讀取文件（xxx.txt）- 第 1/5 部分」
3. **輸入問題**：「請分析這個文件的主要內容」
4. **自動處理**：系統自動分析所有 5 個部分
5. **完整結果**：AI 提供基於完整文件的分析

### 技術優勢
- ✅ **自動化**：無需用戶手動分段
- ✅ **透明化**：顯示當前處理進度
- ✅ **連續性**：AI 可以基於之前的分析繼續
- ✅ **完整性**：確保所有內容都被分析

## 代碼位置

### 主要文件
- `src/components/CopilotChatPanel.tsx`

### 關鍵修改
1. **第 216 行**: 添加 `fileChunks` 狀態
2. **第 227 行**: 添加 `hasMoreChunks` ref
3. **第 445-480 行**: 文件加載時的分段邏輯
4. **第 867-895 行**: 發送消息時的分段處理
5. **第 1519-1533 行**: 自動繼續邏輯
6. **第 2258-2278 行**: UI 進度顯示

## 未來改進

### 可能的優化
1. **智能分段**：按照段落或句子邊界分段，而不是固定字元數
2. **並行處理**：支持多個分段同時分析（需要 AI API 支持）
3. **進度條**：添加視覺化的進度條
4. **暫停/恢復**：允許用戶暫停和恢復分段分析
5. **結果合併**：自動合併所有分段的分析結果為一個完整報告

### 調整參數
如需調整分段大小，修改這個常數：
```typescript
const CHUNK_SIZE = 8000 // 調整此值以改變每段的大小
```

建議範圍：
- 最小：4000 字元（確保每段有足夠上下文）
- 最大：12000 字元（避免單段過長）
- 預設：8000 字元（平衡性能與上下文）
