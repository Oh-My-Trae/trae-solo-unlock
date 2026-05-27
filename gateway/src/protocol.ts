import { MODEL_MAP, DEFAULT_MODEL, SOLO_COMMON_PARAMS } from './constants.js';

// --- OpenAI → SOLO translation ---

export interface OpenAIChatRequest {
  model?: string;
  messages: Array<{ role: string; content: string | null }>;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export function resolveModel(requestedModel?: string): { name: string; display_name: string; multimodal: boolean } {
  if (!requestedModel) return MODEL_MAP[DEFAULT_MODEL];
  // Strip context window suffix like [1M] that Claude Code appends
  const cleaned = requestedModel.replace(/\[.*?\]$/, '').trim();
  const key = cleaned.toLowerCase();
  return MODEL_MAP[key] ?? MODEL_MAP[DEFAULT_MODEL];
}

export function buildCreateSessionBody(req: OpenAIChatRequest, userId: string, webId: string) {
  const model = resolveModel(req.model);
  const userMessage = extractLastUserMessage(req.messages);

  return {
    mode: 'code',
    environment_id: 'default',
    initial_message: {
      chat_session_id: '',
      content: [],
      query: JSON.stringify([{ type: 'text', data: { content: userMessage } }]),
      model_name: model.name,
      agent_type: 'solo_agent_remote',
      model_selection_strategy: 'manual',
      custom_model: {
        name: model.name,
        multimodal: model.multimodal,
        is_default: false,
        display_name: model.display_name,
        config_name: model.name,
        config_source: 1,
        provider: '',
        ak: '',
        sk: '',
        base_url: '',
        auth_type: 0,
        use_remote_service: true,
      },
      common_params: JSON.stringify({
        ...SOLO_COMMON_PARAMS,
        web_id: webId,
        biz_user_id: userId,
        user_unique_id: userId,
      }),
    },
    env: 'remote',
    auto_create_project: false,
    origin: 'web',
  };
}

export function buildSendMessageBody(req: OpenAIChatRequest, sessionId: string, userId: string, webId: string) {
  const model = resolveModel(req.model);
  const userMessage = extractLastUserMessage(req.messages);

  return {
    content: [],
    query: JSON.stringify([{ type: 'text', data: { content: userMessage } }]),
    model_name: model.name,
    agent_type: 'solo_agent_remote',
    model_selection_strategy: 'manual',
    custom_model: {
      name: model.name,
      multimodal: model.multimodal,
      is_default: false,
      display_name: model.display_name,
      config_name: model.name,
      config_source: 1,
      provider: '',
      ak: '',
      sk: '',
      base_url: '',
      auth_type: 0,
      use_remote_service: true,
    },
    common_params: JSON.stringify({
      ...SOLO_COMMON_PARAMS,
      biz_session_id: sessionId,
      web_id: webId,
      biz_user_id: userId,
      user_unique_id: userId,
    }),
  };
}

// --- SOLO → OpenAI translation ---

export function formatOpenAIResponse(content: string, model: string, requestId: string) {
  return {
    id: requestId,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: 'assistant', content },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

export function formatOpenAIStreamChunk(content: string, model: string, requestId: string, finished: boolean) {
  return {
    id: requestId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: finished ? {} : { content },
      finish_reason: finished ? 'stop' : null,
    }],
  };
}

export function formatOpenAIStreamDone(requestId: string, model: string) {
  return {
    id: requestId,
    object: 'chat.completion.chunk',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      delta: {},
      finish_reason: 'stop',
    }],
  };
}

// --- Helpers ---

function extractLastUserMessage(messages: Array<{ role: string; content: string | null }>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && messages[i].content) {
      return messages[i].content!;
    }
  }
  return '';
}

export function generateRequestId(): string {
  return 'chatcmpl-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function generateWebId(): string {
  return String(Math.floor(Math.random() * 9e15) + 1e15);
}
