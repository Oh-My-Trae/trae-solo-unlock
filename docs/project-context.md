# 项目上下文

## 概述

TRAE SOLO CN 是字节跳动基于 VSCode 1.107.1 二次开发的 AI IDE 产品，以 solo-lite 模式运行。

- 版本: appVersion=0.1.7, tronBuildVersion=2.3.24253
- 运行模式: runMode=solo-lite
- 提供商: provider=Yinli, brandName=TRAE SOLO, packageType=SOLO_CN
- 数据目录: ~/.trae-cn

## 源码位置

`D:\apps\TRAE SOLO CN`

## 关键文件路径

### 核心架构
- 主进程: `resources/app/out/main.js`
- 工作台入口: `resources/app/out/vs/code/electron-browser/solo/workbench.js`
- Solo Lite HTML: `resources/app/out/vs/code/electron-browser/solo/solo-lite.html`
- 工作台主JS: `resources/app/out/vs/workbench/workbench.desktop.main.solo-lite.js`
- 桌面配置: `resources/app/out/vs/code/electron-browser/scenes/desktop.config.js`
- 共享进程: `resources/app/out/vs/code/electron-utility/sharedProcess/sharedProcessMain.js`
- 扩展宿主: `resources/app/out/vs/workbench/api/node/extensionHostProcess.js`
- CLI入口: `resources/app/out/cli.js`
- 进程fork: `resources/app/out/bootstrap-fork.js`
- 启动脚本: `bin/trae-solo-cn.cmd` (Windows), `bin/trae-solo-cn` (Unix/WSL)

### 配置文件
- 产品配置: `resources/app/product.json` (~2930行，核心配置)
- 应用清单: `manifest.json`
- 沙箱预加载: `resources/app/out/vs/base/parts/sandbox/electron-browser/preload.js`

### 原生模块
- AI Agent: `resources/app/modules/ai-agent/` (端口40005, Rust)
- CKG: `resources/app/modules/ckg/` (端口50000, Rust)
- Sandbox: `resources/app/modules/sandbox/`

### 扩展
- MCP扩展: `resources/app/extensions/byted-solo.builtin-mcp/`
- Shell扩展: `resources/app/extensions/cloudide.icube-agent-shell-exec/`
- 集成扩展: `resources/app/extensions/byted-solo.integrations-extended/`
- Solo Lite: `resources/app/extensions/solo-lite/`
- Git: `resources/app/extensions/git/`
- 主题: `resources/app/extensions/theme-icube/`, `resources/app/extensions/theme-seti/`

## 启动链路

```
bin/trae-solo-cn.cmd
  → ELECTRON_RUN_AS_NODE=1 "TRAE SOLO CN.exe" cli.js
    → main.js (Electron主进程)
      → solo-lite.html (渲染进程)
        → workbench.js (工作台初始化)
          → workbench.desktop.main.solo-lite.js (主工作台逻辑)
```
