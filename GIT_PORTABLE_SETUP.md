# Git 便携版自动设置

## 概述

Better Agent Terminal 现在内置 **Git 便携版** (Git for Windows Portable)，就像 PowerShell 一样自动下载和配置，无需用户手动安装。

## 目录结构

```
better-agent-terminal/
├── packages/
│   ├── PowerShell/            # PowerShell 7.5.4 便携版
│   │   └── pwsh.exe
│   └── Git/                   # Git 便携版 (自动下载)
│       ├── cmd/
│       │   └── git.exe        # ✅ Git 命令行
│       ├── bin/
│       └── ...
├── scripts/
│   ├── setup-powershell.js    # PowerShell 自动安装
│   └── setup-git.js           # Git 自动安装
└── .gitignore                 # packages/Git/ 不提交
```

## 自动安装流程

### Windows 用户

```bash
npm install
# 自动执行:
# 1. npm run setup:powershell  → 下载 PowerShell 7.5.4 (~110MB)
# 2. npm run setup:git          → 下载 Git 便携版 (~55MB)
```

**安装详情：**
- Git 版本: **2.48.1 (64-bit)**
- 下载源: GitHub Releases (git-for-windows/git)
- 安装位置: `packages/Git/`
- 可执行文件: `packages/Git/cmd/git.exe`

### Linux/Mac 用户

```bash
npm install
# 会显示:
# ⏭️  Skipping Git setup (not Windows)
```

非 Windows 系统使用系统安装的 Git。

## 使用方式

### 在 GitPanel 中使用

GitPanel 组件会自动检测并使用内置 Git：

```typescript
// GitPanel.tsx 自动逻辑
const runGitCommand = async (command: string) => {
  let gitCommand = command
  
  // Windows: 使用内置 Git
  if (isWindows) {
    const bundledGit = 'packages/Git/cmd/git.exe'
    gitCommand = command.replace(/^git\s/, `"${bundledGit}" `)
  }
  
  // Linux/Mac: 使用系统 Git
  // gitCommand = 'git status' (保持不变)
}
```

**优点：**
1. ✅ **无需手动安装** - `npm install` 后即可使用
2. ✅ **版本一致** - 所有开发者使用相同的 Git 版本
3. ✅ **隔离环境** - 不依赖系统 PATH 配置
4. ✅ **便携性** - 可随应用打包分发

## 手动安装（可选）

如果自动安装失败，可以手动下载：

### 下载 Git 便携版

```bash
# 1. 下载地址
https://github.com/git-for-windows/git/releases/download/v2.48.1.windows.1/PortableGit-2.48.1-64-bit.7z.exe

# 2. 运行自解压程序
PortableGit-2.48.1-64-bit.7z.exe

# 3. 解压到
<项目根目录>/packages/Git/

# 4. 验证安装
packages/Git/cmd/git.exe --version
# 应该输出: git version 2.48.1.windows.1
```

## 验证安装

### 检查文件是否存在

```bash
# Windows (PowerShell)
Test-Path packages/Git/cmd/git.exe

# Windows (CMD)
dir packages\Git\cmd\git.exe

# 查看版本
packages\Git\cmd\git.exe --version
```

### 在应用中测试

1. 启动应用: `npm run dev`
2. 创建工作区并选择一个 Git 仓库目录
3. 点击底部工具栏的 **🔀** 按钮创建 Git 面板
4. 查看是否能正确显示分支、状态、提交历史

## 配置说明

### package.json

```json
{
  "scripts": {
    "postinstall": "npm run setup:powershell && npm run setup:git && ...",
    "setup:powershell": "node scripts/setup-powershell.js",
    "setup:git": "node scripts/setup-git.js"
  }
}
```

### .gitignore

```
# Git 便携版二进制文件（不提交到仓库）
packages/Git/
```

## 常见问题

### Q: 为什么要内置 Git？

A: 之前遇到 PTY shell 环境中找不到 Git 命令 (`execvp(3) failed`)，因为 PATH 没有正确加载。内置 Git 可以：
- 直接使用相对路径调用
- 避免 shell 环境配置问题
- 保证跨机器的一致性

### Q: Git 文件很大，会影响仓库吗？

A: 不会。`packages/Git/` 已加入 `.gitignore`，不会提交到仓库。每个开发者在 `npm install` 时自动下载。

### Q: 能否使用系统已安装的 Git？

A: 可以。在 Linux/Mac 上会自动使用系统 Git。Windows 上如果内置 Git 不存在，也会尝试使用系统 PATH 中的 Git。

### Q: 如何更新 Git 版本？

修改 `scripts/setup-git.js` 中的版本号：

```javascript
const GIT_VERSION = '2.48.1'  // 改为新版本
```

然后删除 `packages/Git/` 重新运行 `npm run setup:git`。

## 与 PowerShell 的对比

| 特性 | PowerShell | Git |
|------|-----------|-----|
| 版本 | 7.5.4 | 2.48.1 |
| 大小 | ~110 MB | ~55 MB |
| 格式 | ZIP | 7z 自解压 |
| 位置 | `packages/PowerShell/pwsh.exe` | `packages/Git/cmd/git.exe` |
| 用途 | Shell 执行环境 | 版本控制命令 |
| 平台 | Windows Only | Windows Only (Linux/Mac 用系统版) |

## 开发说明

### 添加新的便携工具

参考 `setup-git.js` 和 `setup-powershell.js`，创建类似的安装脚本：

```javascript
const TOOL_VERSION = 'x.x.x'
const DOWNLOAD_URL = 'https://...'
const TOOL_DIR = path.join(PACKAGES_DIR, 'ToolName')
const TOOL_EXE = path.join(TOOL_DIR, 'tool.exe')

// 检查已存在 → 下载 → 解压 → 验证 → 清理
```

然后在 `package.json` 添加：

```json
{
  "scripts": {
    "setup:tool": "node scripts/setup-tool.js",
    "postinstall": "... && npm run setup:tool"
  }
}
```

## 技术细节

### Git 命令包装

GitPanel 在执行命令时会自动包装：

**原始命令:**
```
git status --porcelain
```

**Windows (包装后):**
```
"packages/Git/cmd/git.exe" status --porcelain
```

**Linux/Mac (不变):**
```
git status --porcelain
```

### PTY 执行流程

```typescript
1. 检测平台: await window.electronAPI.system.getPlatform()
2. Windows: 替换命令中的 'git' 为内置路径
3. 创建 PTY: window.electronAPI.pty.create()
4. 执行命令: pty.write(gitCommand)
5. 收集输出: pty.onOutput()
6. 解析结果: 去除 ANSI 码、shell 提示符
```

## 参考链接

- [Git for Windows](https://git-scm.com/download/win)
- [Git Portable Releases](https://github.com/git-for-windows/git/releases)
- [PowerShell Setup](./POWERSHELL_SETUP.md)
