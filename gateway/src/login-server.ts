import http from 'http';
import { setToken, getTokenInfo } from './token-manager.js';

const LOGIN_PORT = 18081;

let server: http.Server | null = null;

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SOLO Gateway - Login</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
           background: #0a0a0a; color: #e0e0e0; min-height: 100vh;
           display: flex; align-items: center; justify-content: center; }
    .card { background: #1a1a1a; border-radius: 16px; padding: 40px;
            max-width: 500px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.4); }
    h1 { font-size: 24px; margin-bottom: 8px; color: #fff; }
    .subtitle { color: #888; font-size: 14px; margin-bottom: 32px; }
    .step { margin-bottom: 24px; padding: 16px; background: #222; border-radius: 10px; }
    .step-num { display: inline-block; width: 24px; height: 24px; background: #4f8cff;
                color: #fff; border-radius: 50%; text-align: center; line-height: 24px;
                font-size: 13px; font-weight: 600; margin-right: 8px; }
    .step-title { font-weight: 600; color: #fff; }
    .step-desc { color: #aaa; font-size: 13px; margin-top: 8px; line-height: 1.6; }
    a { color: #4f8cff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    button { background: #4f8cff; color: #fff; border: none; padding: 12px 24px;
             border-radius: 8px; font-size: 15px; cursor: pointer; width: 100%;
             margin-top: 12px; font-weight: 600; transition: background 0.2s; }
    button:hover { background: #3a7af0; }
    button:disabled { background: #333; color: #666; cursor: not-allowed; }
    textarea { width: 100%; height: 100px; background: #111; border: 1px solid #333;
               color: #e0e0e0; padding: 12px; border-radius: 8px; font-family: monospace;
               font-size: 12px; resize: vertical; margin-top: 8px; }
    textarea:focus { outline: none; border-color: #4f8cff; }
    .status { margin-top: 20px; padding: 12px; border-radius: 8px; font-size: 14px;
              text-align: center; display: none; }
    .status.ok { display: block; background: #1a3a1a; color: #4f4; }
    .status.err { display: block; background: #3a1a1a; color: #f44; }
    .bookmarklet { display: inline-block; background: #2a2a2a; border: 1px solid #444;
                   padding: 8px 16px; border-radius: 6px; font-size: 13px; cursor: grab;
                   margin-top: 8px; color: #4f8cff; user-select: all; }
    code { background: #222; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>SOLO Gateway Login</h1>
    <p class="subtitle">Connect your SOLO account to the API gateway</p>

    <div class="step">
      <span class="step-num">1</span>
      <span class="step-title">Open SOLO and login</span>
      <div class="step-desc">
        Open <a href="https://solo.trae.cn" target="_blank">solo.trae.cn</a> in another tab
        and login with your account.
      </div>
    </div>

    <div class="step">
      <span class="step-num">2</span>
      <span class="step-title">Copy token via bookmarklet</span>
      <div class="step-desc">
        Drag this link to your bookmarks bar, then click it on the SOLO page:
        <br><br>
        <a class="bookmarklet" href="javascript:void(function(){var t=document.cookie.split(';').find(c=>c.trim().startsWith('jwt_token=')||c.trim().startsWith('solo_token='));if(!t){var h=document.querySelector('[class*=token]');alert('Auto-detect failed. Use method below.')}else{fetch('http://localhost:${LOGIN_PORT}/api/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t.split('=')[1].trim()})}).then(r=>r.json()).then(d=>alert('Token sent! Gateway status: '+JSON.stringify(d))).catch(e=>alert('Error: '+e))}}())">
          SOLO → Gateway
        </a>
      </div>
    </div>

    <div class="step">
      <span class="step-num">3</span>
      <span class="step-title">Or paste JWT token manually</span>
      <div class="step-desc">
        Open DevTools (F12) → Network tab → find any <code>solo.trae.cn/api/remote/v1</code> request →
        copy the <code>Cloud-IDE-JWT ...</code> value from Authorization header.
      </div>
      <textarea id="token" placeholder="Paste Cloud-IDE-JWT eyJhbGci... or just the eyJhbGci... part"></textarea>
      <button id="submit" onclick="submitToken()">Connect</button>
    </div>

    <div id="status" class="status"></div>
  </div>

  <script>
    async function submitToken() {
      const raw = document.getElementById('token').value.trim();
      if (!raw) return;
      // Strip prefix if present
      const token = raw.replace(/^Cloud-IDE-JWT\\s+/i, '').trim();
      const btn = document.getElementById('submit');
      const status = document.getElementById('status');
      btn.disabled = true;
      btn.textContent = 'Connecting...';
      try {
        const resp = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await resp.json();
        if (data.ok) {
          status.className = 'status ok';
          status.textContent = 'Connected! Gateway is ready. Close this page and use the API.';
        } else {
          status.className = 'status err';
          status.textContent = 'Error: ' + JSON.stringify(data);
        }
      } catch (e) {
        status.className = 'status err';
        status.textContent = 'Connection failed: ' + e.message;
      }
      btn.disabled = false;
      btn.textContent = 'Connect';
    }

    // Auto-check status
    fetch('/api/token').then(r => r.json()).then(d => {
      if (d.hasToken) {
        const status = document.getElementById('status');
        status.className = 'status ok';
        status.textContent = 'Already connected! Token expires in ' + d.expiresIn + 's';
      }
    }).catch(() => {});
  </script>
</body>
</html>`;

export function startLoginServer(): Promise<void> {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${LOGIN_PORT}`);

      // CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      if (url.pathname === '/api/token' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => body += chunk);
        req.on('end', () => {
          try {
            const { token } = JSON.parse(body);
            if (token) {
              setToken(token, 7200000, 'login-page');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: true, message: 'Token saved' }));
            } else {
              res.writeHead(400, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'token required' }));
            }
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'invalid JSON' }));
          }
        });
        return;
      }

      if (url.pathname === '/api/token' && req.method === 'GET') {
        const info = getTokenInfo();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(info));
        return;
      }

      // Serve login page
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(LOGIN_PAGE);
    });

    server.listen(LOGIN_PORT, () => {
      console.log(`[login] Login page: http://localhost:${LOGIN_PORT}`);
      resolve();
    });
  });
}

export function stopLoginServer(): void {
  server?.close();
  server = null;
}
