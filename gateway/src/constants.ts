export const GATEWAY_PORT = 18080;

// SOLO API endpoints (discovered via network interception)
export const SOLO_API_BASE = 'https://solo.trae.cn/api/remote/v1';
export const SOLO_AUTH_API = 'https://api.trae.cn/cloudide/api/v3/trae';

// SOLO common params template (captured from web client)
export const SOLO_COMMON_PARAMS = {
  language: 'zh-cn',
  app_language: 'en',
  quality: 'stable',
  app_version: '1.0.0.1300',
  user_identity: 'Free',
  is_freshman: '0',
  scope: 'marscode',
  tenant: 'marscode',
  region: 'CN',
  aiRegion: 'CN',
  solo_chat_mode: 'code',
  is_privacy_mode: 1,
  privacy_mode: 'on',
};

// Model name mapping: OpenAI/Anthropic-style names → SOLO internal names
export const MODEL_MAP: Record<string, { name: string; display_name: string; multimodal: boolean }> = {
  // Anthropic model name aliases (Claude Code uses these)
  'claude-opus-4-6':           { name: 'DeepSeek-V4-Pro',       display_name: 'DeepSeek-V4-Pro (as Opus)',    multimodal: false },
  'claude-sonnet-4-6':         { name: 'Doubao_1_6',            display_name: 'Doubao-Seed-Code (as Sonnet)',  multimodal: true },
  'claude-haiku-4-5-20251001':  { name: 'DeepSeek-V4-Flash',    display_name: 'DeepSeek-V4-Flash (as Haiku)', multimodal: false },
  // SOLO native model names
  'doubao-seed-code':       { name: 'Doubao_1_6',            display_name: 'Doubao-Seed-Code',     multimodal: true },
  'doubao-seed-2.0-code':   { name: 'Doubao-Seed-2.0-Code',  display_name: 'Doubao-Seed-2.0-Code', multimodal: true },
  'deepseek-v4-pro':        { name: 'DeepSeek-V4-Pro',       display_name: 'DeepSeek-V4-Pro',      multimodal: false },
  'deepseek-v4-flash':      { name: 'DeepSeek-V4-Flash',     display_name: 'DeepSeek-V4-Flash',    multimodal: false },
  'kimi-k2.6':              { name: 'kimi-k2.6',             display_name: 'Kimi-K2.6',            multimodal: true },
  'kimi-k2.5':              { name: 'kimi-k2.5',             display_name: 'Kimi-K2.5',            multimodal: true },
  'qwen-3.6-plus':          { name: 'qwen-3.6-plus',         display_name: 'Qwen3.6-Plus',         multimodal: true },
  'qwen-3.5':               { name: 'qwen-3.5',              display_name: 'Qwen3.5-Plus',         multimodal: true },
  'glm-5.1':                { name: 'glm-5.1',               display_name: 'GLM-5.1',              multimodal: false },
  'glm-5':                  { name: 'glm-5',                 display_name: 'GLM-5',                multimodal: false },
  'glm-5v-turbo':           { name: 'glm-5v-turbo',          display_name: 'GLM-5V-Turbo',         multimodal: true },
  'minimax-m2.7':           { name: 'minimax-m2.7',          display_name: 'MiniMax-M2.7',         multimodal: false },
  'minimax-m2.5':           { name: 'minimax-m2.5',          display_name: 'MiniMax-M2.5',         multimodal: false },
};

// Default model
export const DEFAULT_MODEL = 'doubao-seed-code';
