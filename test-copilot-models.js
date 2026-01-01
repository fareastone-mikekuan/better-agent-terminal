#!/usr/bin/env node

const https = require('https');

const GITHUB_TOKEN = process.argv[2] || process.env.GITHUB_TOKEN;
const ORG_SLUG = process.argv[3] || process.env.COPILOT_ORG || '';

if (!GITHUB_TOKEN) {
  console.error('❌ 請提供 GitHub token（PAT 或 OAuth token）');
  console.error('用法: node test-copilot-models.js YOUR_GITHUB_TOKEN [org-slug]');
  console.error('或設定環境變數: GITHUB_TOKEN=...');
  process.exit(1);
}

function httpsRequest({ hostname, path, method, headers, body }) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname,
        path,
        method,
        headers
      },
      (res) => {
        res.setEncoding('utf8');
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      }
    );

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function testGitHubToken() {
  const res = await httpsRequest({
    hostname: 'api.github.com',
    path: '/user',
    method: 'GET',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Better-Agent-Terminal-Test',
      Accept: 'application/json'
    }
  });

  if (res.statusCode !== 200) {
    throw new Error(`GitHub token 無效或無法存取 /user：${res.statusCode} ${res.data}`);
  }

  const user = JSON.parse(res.data);
  return { login: user.login };
}

async function tryExchangeCopilotTokenFromGitHubToken() {
  // Not always available. Many OAuth tokens will get 404 here.
  const res = await httpsRequest({
    hostname: 'api.github.com',
    path: '/copilot_internal/v2/token',
    method: 'GET',
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      'User-Agent': 'Better-Agent-Terminal-Test',
      Accept: 'application/json'
    }
  });

  if (res.statusCode !== 200) {
    return { ok: false, statusCode: res.statusCode, raw: res.data };
  }

  try {
    const payload = JSON.parse(res.data);
    if (!payload.token) {
      return { ok: false, statusCode: res.statusCode, raw: res.data };
    }
    return { ok: true, token: payload.token };
  } catch {
    return { ok: false, statusCode: res.statusCode, raw: res.data };
  }
}

async function testCopilotChatAuth(bearerToken) {
  const requestBody = JSON.stringify({
    messages: [{ role: 'user', content: 'ping' }],
    model: 'gpt-4o',
    temperature: 0,
    top_p: 1,
    max_tokens: 1,
    stream: false
  });

  const res = await httpsRequest({
    hostname: 'api.githubcopilot.com',
    path: '/chat/completions',
    method: 'POST',
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody),
      'User-Agent': 'Better-Agent-Terminal-Test',
      Accept: 'application/json',
      'Editor-Version': 'vscode/1.85.0',
      'Editor-Plugin-Version': 'copilot-chat/0.11.0',
      'Openai-Organization': ORG_SLUG || 'github-copilot',
      'Openai-Intent': 'conversation-panel',
      'VScode-SessionId': Date.now().toString(),
      'VScode-MachineId': 'better-agent-terminal-test'
    },
    body: requestBody
  });

  return res;
}

async function listCopilotModels(copilotToken) {
  const res = await httpsRequest({
    hostname: 'api.githubcopilot.com',
    path: '/models',
    method: 'GET',
    headers: {
      Authorization: `Bearer ${copilotToken}`,
      'User-Agent': 'Better-Agent-Terminal-Test',
      Accept: 'application/json',
      'Editor-Version': 'vscode/1.85.0',
      'Editor-Plugin-Version': 'copilot-chat/0.11.0',
      'Openai-Organization': ORG_SLUG || 'github-copilot',
      'Openai-Intent': 'conversation-panel',
      'VScode-SessionId': Date.now().toString(),
      'VScode-MachineId': 'better-agent-terminal-test'
    }
  });

  // 有些環境可能不開放 /models，這裡把原始回應印出便於判斷
  if (res.statusCode !== 200) {
    return { ok: false, statusCode: res.statusCode, raw: res.data };
  }

  let payload;
  try {
    payload = JSON.parse(res.data);
  } catch {
    return { ok: false, statusCode: res.statusCode, raw: res.data };
  }

  // 兼容不同格式：可能是 {data:[{id:...}]} 或直接陣列
  const modelsArray = Array.isArray(payload) ? payload : payload.data;
  if (!Array.isArray(modelsArray)) {
    return { ok: true, statusCode: res.statusCode, payload };
  }

  const ids = modelsArray
    .map((m) => (typeof m === 'string' ? m : m.id || m.model || m.name))
    .filter(Boolean)
    .sort();

  return { ok: true, statusCode: res.statusCode, ids, count: ids.length, payload };
}

async function probeModels(copilotToken, candidates) {
  const results = [];
  for (const model of candidates) {
    const requestBody = JSON.stringify({
      messages: [{ role: 'user', content: 'ping' }],
      model,
      temperature: 0,
      top_p: 1,
      max_tokens: 1,
      stream: false
    });

    const res = await httpsRequest({
      hostname: 'api.githubcopilot.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${copilotToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
        'User-Agent': 'Better-Agent-Terminal-Test',
        Accept: 'application/json',
        'Editor-Version': 'vscode/1.85.0',
        'Editor-Plugin-Version': 'copilot-chat/0.11.0',
        'Openai-Organization': ORG_SLUG || 'github-copilot',
        'Openai-Intent': 'conversation-panel',
        'VScode-SessionId': Date.now().toString(),
        'VScode-MachineId': 'better-agent-terminal-test'
      },
      body: requestBody
    });

    if (res.statusCode === 200) {
      let actualModel;
      try {
        const payload = JSON.parse(res.data);
        actualModel = payload.model;
      } catch {
        actualModel = undefined;
      }
      results.push({ model, ok: true, actualModel });
      continue;
    }

    let reason = `HTTP ${res.statusCode}`;
    try {
      const payload = JSON.parse(res.data);
      if (payload?.error?.code) reason = payload.error.code;
      else if (payload?.error?.message) reason = payload.error.message;
    } catch {
      // ignore
    }
    results.push({ model, ok: false, reason });
  }
  return results;
}

(async function main() {
  try {
    const user = await testGitHubToken();
    console.log(`✅ GitHub token OK：${user.login}`);

    // Many setups (including device-flow OAuth) can use the OAuth token directly as Bearer for api.githubcopilot.com.
    // First: verify whether the provided token can call Copilot chat.
    let copilotBearer = GITHUB_TOKEN;
    const authCheck = await testCopilotChatAuth(copilotBearer);
    if (authCheck.statusCode === 401 || authCheck.statusCode === 403) {
      // Try exchanging via GitHub internal token endpoint (works in some environments, not all)
      const exchanged = await tryExchangeCopilotTokenFromGitHubToken();
      if (exchanged.ok) {
        copilotBearer = exchanged.token;
      } else {
        throw new Error(
          `此 token 無法直接呼叫 api.githubcopilot.com，且無法從 /copilot_internal/v2/token 交換（${exchanged.statusCode}）。\n` +
            `請改用 App 內建的 Copilot token（若有）或確認帳號已啟用 Copilot。\n` +
            `raw=${exchanged.raw}`
        );
      }
    } else if (authCheck.statusCode !== 200) {
      throw new Error(`Copilot chat auth 檢查失敗：${authCheck.statusCode} ${authCheck.data}`);
    }

    console.log('✅ Copilot bearer token OK');

    const models = await listCopilotModels(copilotBearer);

    if (!models.ok) {
      console.log('⚠️  無法從 /models 取得列表（此環境可能未開放該端點），改用探測方式列出可用模型…');
      console.log(`statusCode=${models.statusCode}`);
      if (models.raw) console.log(models.raw);

      const candidates = [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-16k',
        'o1-preview',
        'o1-mini',
        // Known-nonworking (kept for confirmation)
        'gpt-4-32k',
        'claude-3.5-sonnet',
        'claude-3-sonnet'
      ];

      const probed = await probeModels(copilotBearer, candidates);
      const ok = probed.filter((r) => r.ok);
      const bad = probed.filter((r) => !r.ok);

      console.log(`\n✅ 探測成功（可用）模型數：${ok.length}`);
      for (const r of ok) {
        const suffix = r.actualModel && r.actualModel !== r.model ? ` (resolved=${r.actualModel})` : '';
        console.log(`${r.model}${suffix}`);
      }

      console.log(`\n❌ 探測失敗模型數：${bad.length}`);
      for (const r of bad) {
        console.log(`${r.model} -> ${r.reason}`);
      }

      process.exit(0);
    }

    if (models.ids) {
      console.log(`\n✅ 可用模型數：${models.count}`);
      console.log(models.ids.join('\n'));
      return;
    }

    console.log('\n✅ /models 回傳非預期格式，原始 payload：');
    console.log(JSON.stringify(models.payload, null, 2));
  } catch (err) {
    console.error('❌ 測試失敗：', err?.message || String(err));
    process.exit(1);
  }
})();
