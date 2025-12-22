#!/usr/bin/env node

const https = require('https');

// 從命令行參數獲取 token
const GITHUB_TOKEN = process.argv[2];
const ORG_SLUG = process.argv[3] || '';

if (!GITHUB_TOKEN) {
  console.error('❌ 請提供 GitHub token');
  console.error('用法: node test-copilot-token.js YOUR_GITHUB_TOKEN [org-slug]');
  process.exit(1);
}

console.log('🔍 測試 GitHub Copilot Token...\n');
console.log('Token:', GITHUB_TOKEN.substring(0, 20) + '...');
console.log('Org Slug:', ORG_SLUG || '(未設置)');
console.log('-----------------------------------\n');

// 步驟 1: 測試 GitHub PAT 是否有效
function testGitHubPAT() {
  return new Promise((resolve, reject) => {
    console.log('1️⃣ 測試 GitHub PAT...');
    
    const options = {
      hostname: 'api.github.com',
      path: '/user',
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Better-Agent-Terminal-Test',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const user = JSON.parse(data);
          console.log(`   ✅ GitHub PAT 有效`);
          console.log(`   👤 用戶: ${user.login}`);
          console.log(`   📧 Email: ${user.email || 'N/A'}\n`);
          resolve(user);
        } else {
          console.log(`   ❌ GitHub PAT 無效 (${res.statusCode})`);
          console.log(`   錯誤: ${data}\n`);
          reject(new Error(`Invalid GitHub PAT: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// 步驟 2: 獲取 Copilot Token
function getCopilotToken() {
  return new Promise((resolve, reject) => {
    console.log('2️⃣ 獲取 Copilot Token...');
    
    const options = {
      hostname: 'api.github.com',
      path: '/copilot_internal/v2/token',
      method: 'GET',
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'User-Agent': 'Better-Agent-Terminal-Test',
        'Accept': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          const response = JSON.parse(data);
          console.log(`   ✅ Copilot Token 獲取成功`);
          console.log(`   🔑 Token: ${response.token.substring(0, 30)}...`);
          console.log(`   ⏰ 過期時間: ${response.expires_at || 'N/A'}\n`);
          resolve(response.token);
        } else if (res.statusCode === 404) {
          console.log(`   ❌ 無法獲取 Copilot Token (404)`);
          console.log(`   💡 可能原因:`);
          console.log(`      - 您的帳戶未訂閱 GitHub Copilot`);
          console.log(`      - 請訪問 https://github.com/features/copilot 訂閱\n`);
          reject(new Error('Copilot not enabled'));
        } else {
          console.log(`   ❌ 無法獲取 Copilot Token (${res.statusCode})`);
          console.log(`   響應: ${data}\n`);
          reject(new Error(`Failed to get Copilot token: ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

// 步驟 3: 測試 Copilot API
function testCopilotAPI(copilotToken) {
  return new Promise((resolve, reject) => {
    console.log('3️⃣ 測試 Copilot API...');
    
    const requestBody = JSON.stringify({
      messages: [
        { role: 'user', content: 'Say hello' }
      ],
      model: 'gpt-4',
      temperature: 0.7,
      top_p: 1,
      max_tokens: 100,
      stream: false
    });

    const options = {
      hostname: 'api.githubcopilot.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${copilotToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'User-Agent': 'Better-Agent-Terminal-Test',
        'Accept': 'application/json',
        'Editor-Version': 'vscode/1.85.0',
        'Editor-Plugin-Version': 'copilot-chat/0.11.0',
        'Openai-Organization': ORG_SLUG || 'github-copilot',
        'Openai-Intent': 'conversation-panel',
        'VScode-SessionId': Date.now().toString(),
        'VScode-MachineId': 'better-agent-terminal-test'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`   狀態碼: ${res.statusCode}`);
        
        if (res.statusCode === 200) {
          const response = JSON.parse(data);
          console.log(`   ✅ Copilot API 測試成功`);
          console.log(`   🤖 回應: ${response.choices[0].message.content}\n`);
          resolve(response);
        } else {
          console.log(`   ❌ Copilot API 測試失敗 (${res.statusCode})`);
          console.log(`   響應: ${data}\n`);
          
          if (res.statusCode === 400) {
            console.log(`   💡 400 錯誤可能原因:`);
            console.log(`      - 請求格式錯誤`);
            console.log(`      - Organization Slug 不正確`);
            console.log(`      - API 參數不符合要求\n`);
          }
          
          reject(new Error(`Copilot API error: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (err) => {
      console.log(`   ❌ 網絡錯誤: ${err.message}\n`);
      reject(err);
    });

    req.write(requestBody);
    req.end();
  });
}

// 執行測試
async function runTests() {
  try {
    await testGitHubPAT();
    const copilotToken = await getCopilotToken();
    await testCopilotAPI(copilotToken);
    
    console.log('-----------------------------------');
    console.log('✅ 所有測試通過！GitHub Copilot 配置正確！');
  } catch (error) {
    console.log('-----------------------------------');
    console.log(`❌ 測試失敗: ${error.message}`);
    process.exit(1);
  }
}

runTests();
