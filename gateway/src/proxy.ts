import { SOLO_API_BASE } from './constants.js';
import { getToken } from './token-manager.js';
import {
  buildCreateSessionBody,
  buildSendMessageBody,
  formatOpenAIResponse,
  formatOpenAIStreamChunk,
  formatOpenAIStreamDone,
  resolveModel,
  generateRequestId,
  generateWebId,
} from './protocol.js';
import type { OpenAIChatRequest } from './protocol.js';

interface SoloSSEEvent {
  event?: string;
  data?: string;
  id?: string;
}

// Cached identity from the first API call
let cachedUserId: string | null = null;
let webId: string = generateWebId();

function getHeaders(token: string): Record<string, string> {
  return {
    'Authorization': `Cloud-IDE-JWT ${token}`,
    'Content-Type': 'application/json',
    'x-trae-client-type': 'web',
    'x-trae-user-timezone': 'Asia/Shanghai',
    'x-preferenced-language': 'zh-cn',
    'Referer': 'https://solo.trae.cn/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
}

async function fetchJson(url: string, token: string, options?: RequestInit): Promise<any> {
  const resp = await fetch(url, {
    ...options,
    headers: { ...getHeaders(token), ...options?.headers },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`SOLO API ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json();
}

// Ensure we know the user ID (from any authenticated API call)
async function ensureUserId(token: string): Promise<string> {
  if (cachedUserId) return cachedUserId;
  // Extract from JWT payload
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
      cachedUserId = payload.data?.user_id || payload.data?.id || '0';
      return cachedUserId!;
    }
  } catch { /* fallback */ }
  cachedUserId = '0';
  return cachedUserId;
}

// --- Main chat handler ---

export async function handleChatCompletion(
  req: OpenAIChatRequest,
  stream: boolean,
  res: import('express').Response,
): Promise<void> {
  const token = getToken();
  if (!token) {
    res.status(401).json({ error: { message: '没有可用的 SOLO Token。请通过 POST /token 设置，或将 JWT 放入 ~/.trae-cn/trae-jwt-token', type: 'auth_error' } });
    return;
  }

  const userId = await ensureUserId(token);
  const requestId = generateRequestId();
  const model = resolveModel(req.model);

  try {
    // Step 1: Create session with initial message
    const createBody = buildCreateSessionBody(req, userId, webId);
    const createResp = await fetchJson(`${SOLO_API_BASE}/chat_sessions`, token, {
      method: 'POST',
      body: JSON.stringify(createBody),
    });

    if (createResp.code !== 0) {
      res.status(502).json({ error: { message: `SOLO 创建会话失败: ${createResp.message}`, type: 'upstream_error' } });
      return;
    }

    const sessionId = createResp.data.chat_session_id;

    // Step 2: Stream or poll the response
    if (stream) {
      await streamResponse(sessionId, requestId, model.name, token, res);
    } else {
      await pollResponse(sessionId, requestId, model.name, token, res);
    }
  } catch (err: any) {
    console.error('[代理] 聊天请求出错:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: { message: err.message, type: 'gateway_error' } });
    }
  }
}

// --- Polling mode (non-streaming) ---

async function pollResponse(
  sessionId: string,
  requestId: string,
  model: string,
  token: string,
  res: import('express').Response,
): Promise<void> {
  const maxWait = 120_000; // 2 min
  const interval = 2_000;
  const start = Date.now();

  while (Date.now() - start < maxWait) {
    const msgResp = await fetchJson(
      `${SOLO_API_BASE}/chat_sessions/${sessionId}/messages?page_size=50`,
      token,
    );

    if (msgResp.code === 0 && msgResp.data?.items) {
      // Look for assistant message
      const assistantMsg = msgResp.data.items.find(
        (m: any) => m.role === 'assistant' && m.status !== 'in_progress'
      );
      if (assistantMsg) {
        const content = extractMessageContent(assistantMsg);
        res.json(formatOpenAIResponse(content, model, requestId));
        return;
      }
      // Check if there's an error
      const errorMsg = msgResp.data.items.find(
        (m: any) => m.status === 'failed' || m.status === 'error'
      );
      if (errorMsg) {
        res.status(502).json({ error: { message: 'SOLO 响应失败', type: 'upstream_error' } });
        return;
      }
    }

    await new Promise(r => setTimeout(r, interval));
  }

  res.status(504).json({ error: { message: 'SOLO 响应超时', type: 'timeout' } });
}

// --- Streaming mode (poll-based with chunk delivery) ---

async function streamResponse(
  sessionId: string,
  requestId: string,
  model: string,
  token: string,
  res: import('express').Response,
): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const maxWait = 120_000;
  const start = Date.now();
  let deliveredLength = 0;
  let pollInterval = 800;

  while (Date.now() - start < maxWait) {
    try {
      const msgResp = await fetchJson(
        `${SOLO_API_BASE}/chat_sessions/${sessionId}/messages?page_size=50`,
        token,
      );

      if (msgResp.code === 0 && msgResp.data?.items) {
        const assistantMsg = msgResp.data.items.find((m: any) => m.role === 'assistant');
        if (assistantMsg) {
          const content = extractMessageContent(assistantMsg);
          const isComplete = assistantMsg.status !== 'in_progress';

          // Send any new content as a chunk
          if (content.length > deliveredLength) {
            const delta = content.slice(deliveredLength);
            deliveredLength = content.length;
            const chunk = formatOpenAIStreamChunk(delta, model, requestId, false);
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }

          // If complete, send done
          if (isComplete) {
            const doneChunk = formatOpenAIStreamDone(requestId, model);
            res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
        }
      }
    } catch (err: any) {
      console.error('[流式] 轮询出错:', err.message);
    }

    await new Promise(r => setTimeout(r, pollInterval));
  }

  // Timeout
  if (!res.writableEnded) {
    const chunk = formatOpenAIStreamDone(requestId, model);
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

// --- Content extraction helpers ---

function extractMessageContent(msg: any): string {
  const content = msg.content || '';
  try {
    const parsed = JSON.parse(content);

    // SOLO structured response: { task_id, messages: [...] }
    if (parsed.messages && Array.isArray(parsed.messages)) {
      return extractFromSoloMessages(parsed.messages);
    }

    // Simple array format: [{ type: "text", text_content: "..." }]
    if (Array.isArray(parsed)) {
      return parsed
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text_content || c.data?.content || '')
        .join('');
    }
  } catch { /* not JSON, return as-is */ }
  return content;
}

function extractFromSoloMessages(messages: any[]): string {
  const parts: string[] = [];

  for (const msg of messages) {
    const pi = msg.plan_item;
    if (!pi) continue;

    // Extract reasoning content
    if (pi.reasoning_content) {
      // Skip internal reasoning, only include if user wants it
    }

    const tc = pi.tool_call_info;
    if (!tc) continue;

    // "finish" tool = final answer
    if (tc.name === 'finish' && tc.params?.summary) {
      parts.push(tc.params.summary);
    }

    // Also extract from result data if present
    const resultData = tc.result?.data;
    if (resultData?.summary && tc.name !== 'finish') {
      parts.push(resultData.summary);
    }
  }

  return parts.join('\n\n') || '';
}

// --- Model list ---

export async function fetchModels(token: string): Promise<any[]> {
  try {
    const resp = await fetchJson(
      `${SOLO_API_BASE}/models?functions=solo_agent_remote,solo_work_remote`,
      token,
    );
    if (resp.code === 0 && resp.data?.list) {
      const models: any[] = [];
      for (const group of resp.data.list) {
        for (const m of group.models || []) {
          models.push({
            id: m.name.toLowerCase(),
            object: 'model',
            created: Math.floor(Date.now() / 1000),
            owned_by: 'solo-gateway',
            display_name: m.display_name,
            multimodal: m.multimodal,
            is_beta: m.is_beta,
          });
        }
      }
      return models;
    }
  } catch (err: any) {
    console.error('[模型] 获取模型列表出错:', err.message);
  }
  return [];
}
