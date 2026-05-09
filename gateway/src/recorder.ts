import fs from 'fs';
import path from 'path';
import { API_DOCS_DIR, LOG_DIR } from './constants.js';

interface ApiRecord {
  timestamp: string;
  method: string;
  url: string;
  statusCode?: number;
  requestHeaders?: Record<string, string>;
  responseBodySnippet?: string;
}

let records: ApiRecord[] = [];

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function recordRequest(method: string, url: string, headers?: Record<string, string>): void {
  records.push({
    timestamp: new Date().toISOString(),
    method,
    url,
    requestHeaders: headers ? sanitizeHeaders(headers) : undefined,
  });
}

export function recordResponse(url: string, statusCode: number, bodySnippet: string): void {
  const lastRecord = [...records].reverse().find(r => r.url === url);
  if (lastRecord) {
    lastRecord.statusCode = statusCode;
    lastRecord.responseBodySnippet = bodySnippet.slice(0, 500);
  }
}

export function getRecords(): ApiRecord[] {
  return records;
}

export function saveApiDocs(): void {
  ensureDir(API_DOCS_DIR);
  const docPath = path.join(API_DOCS_DIR, 'discovered-apis.json');
  fs.writeFileSync(docPath, JSON.stringify(records, null, 2));
  console.log(`📄 API 文档已保存: ${docPath}`);
}

function sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (/authorization|cookie|token/i.test(k)) {
      safe[k] = '[REDACTED]';
    } else {
      safe[k] = v;
    }
  }
  return safe;
}
