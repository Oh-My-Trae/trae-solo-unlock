import express from 'express';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import type { IncomingMessage, ServerResponse } from 'http';
import cors from 'cors';
import { GATEWAY_PORT, TARGET_HOST } from './constants.js';
import { recordRequest, recordResponse, saveApiDocs } from './recorder.js';
import { setToken } from './token-manager.js';

export function createProxyApp(): express.Application {
  const app = express();
  
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  
  // 记录请求日志中间件
  app.use((req, _res, next) => {
    recordRequest(req.method, req.url, req.headers as Record<string, string>);
    
    // 尝试从请求中提取 token
    const authHeader = req.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      setToken(authHeader.replace('Bearer ', ''), 7200000, 'client-request');
    }
    
    next();
  });

  // 代理到真实后端
  const proxyOpts = {
    target: TARGET_HOST,
    changeOrigin: true,
    secure: false,
    onProxyReq: (_proxyReq: IncomingMessage, req: IncomingMessage) => {
      recordRequest(req.method || 'GET', req.url || '/');
      
      // 提取认证信息
      const auth = req.headers['authorization'];
      if (auth && typeof auth === 'string') {
        setToken(auth.replace(/^Bearer\s+/, ''), 7200000, 'solo-intercept');
      }
    },
    onProxyRes: (proxyRes: ServerResponse<IncomingMessage>, req: IncomingMessage) => {
      let chunks: Buffer[] = [];
      proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8').slice(0, 500);
        recordResponse(req.url || '/', proxyRes.statusCode || 0, body);
      });
    },
  };

  // 代理所有 /agent/*, /ckg/*, /cue/*, /hub/* 路径
  app.use('/agent', createProxyMiddleware(proxyOpts));
  app.use('/ckg', createProxyMiddleware(proxyOpts));
  app.use('/cue', createProxyMiddleware(proxyOpts));
  app.use('/hub', createProxyMiddleware(proxyOpts));

  // OpenAI 兼容 API 端点
  setupOpenAIEndpoints(app);

  // 状态端点
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', gateway: 'solo-api-gateway', port: GATEWAY_PORT });
  });

  // API 文档端点
  app.get('/api-docs', (_req, res) => {
    saveApiDocs();
    res.json({ records: require('./recorder.js').getRecords() });
  });

  // Token 信息端点
  app.get('/token', (_req, res) => {
    const info = require('./token-manager.js').getTokenInfo();
    res.json(info);
  });

  return app;
}

function setupOpenAIEndpoints(app: express.Application): void {
  // POST /v1/chat/completions — OpenAI 兼容对话接口
  app.post('/v1/chat/completions', async (req, res) => {
    recordRequest('POST', '/v1/chat/completions', req.headers as Record<string, string>);
    
    const { model, messages, stream, ...rest } = req.body || {};
    
    // 转换为 SOLO 格式并代理 (Node 18+ 内置 fetch)
    const fetch = globalThis.fetch.bind(globalThis);
    
    try {
      const response = await fetch(`${TARGET_HOST}/agent/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(req.headers.authorization ? { Authorization: req.headers.authorization } : {}),
          ...(req.headers.cookie ? { Cookie: req.headers.cookie } : {}),
        },
        body: JSON.stringify({
          model: model || 'auto',
          messages: messages || [],
          options: rest,
        }),
      });

      const data = await response.text();
      recordResponse('/v1/chat/completions', response.status, data);

      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(data);
      } else {
        try {
          const json = JSON.parse(data);
          res.json(convertToOpenAIFormat(json));
        } catch {
          res.status(response.status).send(data);
        }
      }
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message, type: 'gateway_error' } });
    }
  });

  // GET /v1/models — 模型列表
  app.get('/v1/models', async (_req, res) => {
    res.json({
      object: 'list',
      data: [
        { id: 'auto', object: 'model', owned_by: 'solo-gateway' },
        { id: 'deepseek-V3', object: 'model', owned_by: 'solo-gateway' },
        { id: 'deepseek-r1', object: 'model', owned_by: 'solo-gateway' },
      ],
    });
  });

  // POST /v1/embeddings — 嵌入接口
  app.post('/v1/embeddings', async (req, res) => {
    recordRequest('POST', '/v1/embeddings', req.headers as Record<string, string>);
    res.json({ 
      message: 'Embeddings endpoint - proxies to CKG embedding service',
      original_body: req.body 
    });
  });
}

function convertToOpenAIFormat(soloResponse: any): any {
  if (soloResponse.choices) {
    return soloResponse;
  }
  if (typeof soloResponse === 'string') {
    return {
      id: 'chatcmpl-' + Date.now(),
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'auto',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: soloResponse },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
  }
  return soloResponse;
}
