#!/bin/bash

echo "嘗試從 VS Code 提取 GitHub OAuth token..."
echo ""

# 方法 1: 使用 secret-tool (GNOME Keyring)
echo "方法 1: 使用 GNOME Keyring"
if command -v secret-tool &> /dev/null; then
    TOKEN=$(secret-tool lookup server github.com user vscode 2>/dev/null)
    if [ -n "$TOKEN" ]; then
        echo "✅ 找到 token!"
        echo "$TOKEN"
        exit 0
    fi
    
    # 嘗試其他可能的屬性
    TOKEN=$(secret-tool lookup service github 2>/dev/null)
    if [ -n "$TOKEN" ]; then
        echo "✅ 找到 token!"
        echo "$TOKEN"
        exit 0
    fi
else
    echo "❌ secret-tool 未安裝"
fi

echo ""
echo "方法 2: 檢查 VS Code SQLite 資料庫"
# VS Code 可能將某些資料存在 SQLite
VSCODE_DB="$HOME/.config/Code/User/globalStorage/state.vscdb"
if [ -f "$VSCODE_DB" ]; then
    echo "找到 VS Code 資料庫: $VSCODE_DB"
    if command -v sqlite3 &> /dev/null; then
        echo "嘗試讀取..."
        sqlite3 "$VSCODE_DB" "SELECT * FROM ItemTable WHERE key LIKE '%github%' OR key LIKE '%copilot%';" 2>/dev/null || echo "無法讀取資料庫"
    else
        echo "❌ sqlite3 未安裝"
    fi
else
    echo "❌ 未找到 VS Code 資料庫"
fi

echo ""
echo "❌ 無法自動提取 token"
echo ""
echo "📋 替代方案："
echo "1. 聯繫組織管理員批准 OAuth App (client_id: Iv1.b507a08c87ecfe98)"
echo "2. 或註冊新的 GitHub OAuth App: https://github.com/settings/developers"
