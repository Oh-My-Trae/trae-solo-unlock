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
    <h1>SOLO 网关登录</h1>
    <p class="subtitle">将你的 SOLO 账号连接到 API 网关</p>

    <div class="step">
      <span class="step-num">1</span>
      <span class="step-title">打开 SOLO 并登录</span>
      <div class="step-desc">
        在新标签页打开 <a href="https://solo.trae.cn" target="_blank">solo.trae.cn</a>，登录你的账号。
      </div>
    </div>

    <div class="step">
      <span class="step-num">2</span>
      <span class="step-title">通过书签脚本一键提取 Token</span>
      <div class="step-desc">
        将下方链接拖到书签栏，然后在 SOLO 页面点击它：
        <br><br>
        <a class="bookmarklet" href="javascript:void(function(){var t=document.cookie.split(';').find(c=>c.trim().startsWith('jwt_token=')||c.trim().startsWith('solo_token='));if(!t){var h=document.querySelector('[class*=token]');alert('自动检测失败，请使用下方手动方式。')}else{fetch('http://localhost:${LOGIN_PORT}/api/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t.split('=')[1].trim()})}).then(r=>r.json()).then(d=>alert('Token 已发送！网关状态: '+JSON.stringify(d))).catch(e=>alert('错误: '+e))}}())">
          SOLO → 网关
        </a>
      </div>
    </div>

    <div class="step">
      <span class="step-num">3</span>
      <span class="step-title">或手动粘贴 JWT Token</span>
      <div class="step-desc">
        打开开发者工具 (F12) → Network 标签页 → 找到任意 <code>solo.trae.cn/api/remote/v1</code> 请求 →
        复制 Authorization 请求头中 <code>Cloud-IDE-JWT ...</code> 的值。
      </div>
      <textarea id="token" placeholder="粘贴 Cloud-IDE-JWT eyJhbGci... 或只粘贴 eyJhbGci... 部分"></textarea>
      <button id="submit" onclick="submitToken()">连接</button>
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
      btn.textContent = '连接中...';
      try {
        const resp = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await resp.json();
        if (data.ok) {
          status.className = 'status ok';
          status.textContent = '连接成功！网关已就绪，关闭此页面即可使用 API。';
        } else {
          status.className = 'status err';
          status.textContent = '错误: ' + JSON.stringify(data);
        }
      } catch (e) {
        status.className = 'status err';
        status.textContent = '连接失败: ' + e.message;
      }
      btn.disabled = false;
      btn.textContent = '连接';
    }

    // Auto-check status
    fetch('/api/token').then(r => r.json()).then(d => {
      if (d.hasToken) {
        const status = document.getElementById('status');
        status.className = 'status ok';
        status.textContent = '已连接！Token 将在 ' + d.expiresIn + ' 秒后过期。';
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
              res.end(JSON.stringify({ error: '请提供 token' }));
            }
          } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '无效的 JSON' }));
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
      console.log(`[登录页] 已启动: http://localhost:${LOGIN_PORT}`);
      resolve();
    });
  });
}

export function stopLoginServer(): void {
  server?.close();
  server = null;
}
