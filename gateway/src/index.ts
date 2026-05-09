import { Command } from 'commander';
import { createProxyApp } from './proxy.js';
import { GATEWAY_PORT } from './constants.js';
import http from 'http';

let server: http.Server | null = null;

async function startGateway(): Promise<void> {
  const app = createProxyApp();
  server = app.listen(GATEWAY_PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║     SOLO API Gateway 启动成功         ║
║                                        ║
║   地址: http://localhost:${GATEWAY_PORT}           ║
║   Health: http://localhost:${GATEWAY_PORT}/health  ║
║   Models: http://localhost:${GATEWAY_PORT}/v1/models║
║   Docs:   http://localhost:${GATEWAY_PORT}/api-docs  ║
║   Token:  http://localhost:${GATEWAY_PORT}/token    ║
║                                        ║
║   Ctrl+C 停止                         ║
╚════════════════════════════════════════╝
`);
  });
}

function stopGateway(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => {
        console.log('✅ API Gateway 已停止');
        resolve();
      });
    } else {
      console.log('⚠️ API Gateway 未运行');
      resolve();
    }
  });
}

const program = new Command();

program.name('solo-gateway').version('0.1.0');

program.command('start').description('启动 API 网关').action(startGateway);
program.command('stop').description('停止 API 网关').action(stopGateway);
program.command('docs').description('生成 API 文档').action(() => {
  const { saveApiDocs } = require('./recorder.js');
  saveApiDocs();
});

program.parse();
