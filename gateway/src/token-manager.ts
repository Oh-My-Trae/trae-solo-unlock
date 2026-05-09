interface TokenInfo {
  token: string;
  expiresAt: number;
  source: string;
}

let cachedToken: TokenInfo | null = null;

export function setToken(token: string, ttlMs: number = 3600000, source: string = 'intercepted'): void {
  cachedToken = {
    token,
    expiresAt: Date.now() + ttlMs,
    source,
  };
  console.log(`🔑 Token 已缓存 (来源: ${source}, 有效期: ${ttlMs / 1000}s)`);
}

export function getToken(): string | null {
  if (!cachedToken) return null;
  if (Date.now() > cachedToken.expiresAt) {
    console.log('⏰ Token 已过期');
    cachedToken = null;
    return null;
  }
  return cachedToken.token;
}

export function hasToken(): boolean {
  return !!getToken();
}

export function getTokenInfo(): { hasToken: boolean; source?: string; expiresIn?: number } | null {
  if (!cachedToken) return { hasToken: false };
  const remaining = Math.max(0, cachedToken.expiresAt - Date.now());
  return {
    hasToken: true,
    source: cachedToken.source,
    expiresIn: Math.round(remaining / 1000),
  };
}
