import { GATEWAY_PORT } from './constants.js';
import { setToken, hasToken, getTokenInfo } from './token-manager.js';
import { handleChatCompletion, fetchModels } from './proxy.js';
import { startLoginServer, stopLoginServer } from './login-server.js';
import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- OpenAI-compatible endpoints ---

app.post('/v1/chat/completions', async (req, res) => {
  const { model, messages, stream, ...rest } = req.body;
  const isStream = stream === true;
  await handleChatCompletion({ model, messages, stream: isStream, ...rest }, isStream, res);
});

app.get('/v1/models', async (_req, res) => {
  const token = (await import('./token-manager.js')).getToken();
  if (!token) {
    res.json({
      object: 'list',
      data: [
        { id: 'doubao-seed-code', object: 'model', owned_by: 'solo-gateway' },
        { id: 'doubao-seed-2.0-code', object: 'model', owned_by: 'solo-gateway' },
        { id: 'deepseek-v4-pro', object: 'model', owned_by: 'solo-gateway' },
        { id: 'deepseek-v4-flash', object: 'model', owned_by: 'solo-gateway' },
        { id: 'kimi-k2.6', object: 'model', owned_by: 'solo-gateway' },
        { id: 'kimi-k2.5', object: 'model', owned_by: 'solo-gateway' },
        { id: 'qwen-3.6-plus', object: 'model', owned_by: 'solo-gateway' },
        { id: 'qwen-3.5', object: 'model', owned_by: 'solo-gateway' },
        { id: 'glm-5.1', object: 'model', owned_by: 'solo-gateway' },
        { id: 'glm-5', object: 'model', owned_by: 'solo-gateway' },
        { id: 'glm-5v-turbo', object: 'model', owned_by: 'solo-gateway' },
        { id: 'minimax-m2.7', object: 'model', owned_by: 'solo-gateway' },
        { id: 'minimax-m2.5', object: 'model', owned_by: 'solo-gateway' },
      ],
    });
    return;
  }
  const models = await fetchModels(token);
  res.json({ object: 'list', data: models });
});

// --- Gateway management ---

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', gateway: 'solo-gateway', port: GATEWAY_PORT, hasToken: hasToken() });
});

app.get('/token', (_req, res) => {
  res.json(getTokenInfo());
});

app.post('/token', (req, res) => {
  const { token, ttl } = req.body;
  if (!token) { res.status(400).json({ error: 'token required' }); return; }
  setToken(token, ttl || 7200000, 'manual');
  res.json({ ok: true, ...getTokenInfo() });
});

// --- SOLO API passthrough ---
app.use('/solo', async (req, res) => {
  const { getToken } = await import('./token-manager.js');
  const token = getToken();
  if (!token) { res.status(401).json({ error: 'No token' }); return; }
  const targetUrl = `https://solo.trae.cn/api/remote/v1${req.url}`;
  try {
    const resp = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Authorization': `Cloud-IDE-JWT ${token}`,
        'Content-Type': 'application/json',
        'x-trae-client-type': 'web',
        'x-trae-user-timezone': 'Asia/Shanghai',
        'x-preferenced-language': 'zh-cn',
        'Referer': 'https://solo.trae.cn/',
      },
      body: req.method !== 'GET' && req.method !== 'HEAD' ? JSON.stringify(req.body) : undefined,
    });
    const ct = resp.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', ct);
    res.status(resp.status).send(await resp.text());
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// --- Start ---

async function main() {
  // Start login server first if no token
  if (!hasToken()) {
    await startLoginServer();
  }

  app.listen(GATEWAY_PORT, () => {
    const info = getTokenInfo();
    console.log(`
  SOLO API Gateway v2
  ========================
  Address:   http://localhost:${GATEWAY_PORT}
  Health:    http://localhost:${GATEWAY_PORT}/health
  Models:    http://localhost:${GATEWAY_PORT}/v1/models
  Login:     http://localhost:${GATEWAY_PORT + 1}/login  (get JWT token)
  Set token: POST /token {"token": "<JWT>"}
  Status:    ${info.hasToken ? `Token OK (expires in ${info.expiresIn}s)` : 'No token - visit login page'}
  ========================
  Claude Code / OpenAI:
    OPENAI_BASE_URL=http://localhost:${GATEWAY_PORT}/v1
    OPENAI_API_KEY=any
  ========================
`);
  });
}

main().catch(console.error);
