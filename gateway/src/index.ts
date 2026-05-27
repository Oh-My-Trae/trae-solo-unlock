import express from 'express';
import cors from 'cors';
import { GATEWAY_PORT } from './constants.js';
import { setToken, getToken, hasToken, getTokenInfo, extractFromAuthHeader } from './token-manager.js';
import { handleChatCompletion, fetchModels } from './proxy.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- OpenAI-compatible endpoints ---

// POST /v1/chat/completions
app.post('/v1/chat/completions', async (req, res) => {
  const { model, messages, stream, ...rest } = req.body;
  const isStream = stream === true;
  await handleChatCompletion({ model, messages, stream: isStream, ...rest }, isStream, res);
});

// GET /v1/models
app.get('/v1/models', async (_req, res) => {
  const token = getToken();
  if (!token) {
    // Return static list when no token
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

// --- Gateway management endpoints ---

// GET /health
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', gateway: 'solo-gateway', port: GATEWAY_PORT, hasToken: hasToken() });
});

// GET /token
app.get('/token', (_req, res) => {
  res.json(getTokenInfo());
});

// POST /token — set token manually
app.post('/token', (req, res) => {
  const { token, ttl } = req.body;
  if (!token) {
    res.status(400).json({ error: 'token required' });
    return;
  }
  setToken(token, ttl || 7200000, 'manual');
  res.json({ ok: true, ...getTokenInfo() });
});

// --- Proxy passthrough for raw SOLO API ---
// Useful for direct API access with token
app.use('/solo', async (req, res) => {
  const token = getToken();
  if (!token) {
    res.status(401).json({ error: 'No token' });
    return;
  }
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
    const contentType = resp.headers.get('content-type') || 'application/json';
    res.setHeader('Content-Type', contentType);
    const body = await resp.text();
    res.status(resp.status).send(body);
  } catch (err: any) {
    res.status(502).json({ error: err.message });
  }
});

// --- Start ---

app.listen(GATEWAY_PORT, () => {
  console.log(`
  SOLO API Gateway
  ========================
  Address:  http://localhost:${GATEWAY_PORT}
  Health:   http://localhost:${GATEWAY_PORT}/health
  Models:   http://localhost:${GATEWAY_PORT}/v1/models
  Token:    http://localhost:${GATEWAY_PORT}/token
  Set token: POST http://localhost:${GATEWAY_PORT}/token  {"token": "<JWT>"}
  ========================
  Claude Code usage:
    ANTHROPIC_BASE_URL=http://localhost:${GATEWAY_PORT}/v1
    OPENAI_BASE_URL=http://localhost:${GATEWAY_PORT}/v1
  ========================
  `);
});
