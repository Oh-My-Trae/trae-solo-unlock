import fs from 'fs';
import path from 'path';
import os from 'os';

interface TokenInfo {
  token: string;
  expiresAt: number;
  source: string;
}

let cachedToken: TokenInfo | null = null;

// Known token file locations
const TOKEN_PATHS = [
  path.join(os.homedir(), '.trae-cn', 'trae-jwt-token'),
  path.join(os.homedir(), '.icube', 'trae-jwt-token'),
];

export function setToken(token: string, ttlMs: number = 7200000, source: string = 'manual'): void {
  cachedToken = {
    token,
    expiresAt: Date.now() + ttlMs,
    source,
  };
  console.log(`[token] cached (source: ${source}, ttl: ${Math.round(ttlMs / 1000)}s)`);
}

export function getToken(): string | null {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }
  // Try auto-load from file
  const loaded = loadTokenFromFile();
  if (loaded) return loaded;
  return null;
}

export function hasToken(): boolean {
  return !!getToken();
}

export function getTokenInfo(): { hasToken: boolean; source?: string; expiresIn?: number } {
  if (!cachedToken) return { hasToken: false };
  const remaining = Math.max(0, cachedToken.expiresAt - Date.now());
  return {
    hasToken: true,
    source: cachedToken.source,
    expiresIn: Math.round(remaining / 1000),
  };
}

function loadTokenFromFile(): string | null {
  for (const tokenPath of TOKEN_PATHS) {
    try {
      if (fs.existsSync(tokenPath)) {
        const token = fs.readFileSync(tokenPath, 'utf-8').trim();
        if (token) {
          // JWT exp is in seconds
          const payload = decodeJwtPayload(token);
          const ttl = payload?.exp ? (payload.exp * 1000 - Date.now()) : 7200000;
          if (ttl > 0) {
            setToken(token, ttl, `file:${tokenPath}`);
            return token;
          } else {
            console.warn(`[token] file token expired: ${tokenPath}`);
          }
        }
      }
    } catch { /* skip */ }
  }
  return null;
}

function decodeJwtPayload(jwt: string): { exp?: number } | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64').toString('utf-8');
    return JSON.parse(payload);
  } catch { return null; }
}

// Extract token from Authorization header value (for proxy mode)
export function extractFromAuthHeader(header: string): string | null {
  // Accept "Cloud-IDE-JWT <token>" or "Bearer <token>"
  const match = header.match(/^(?:Cloud-IDE-JWT|Bearer)\s+(.+)$/i);
  return match?.[1] ?? null;
}
