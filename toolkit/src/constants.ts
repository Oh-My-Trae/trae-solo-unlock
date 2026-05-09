export const SOLO_APP_DIR = 'D:\\apps\\TRAE SOLO CN';
export const SOLO_EXE = `${SOLO_APP_DIR}\\TRAE SOLO CN.exe`;
export const PRODUCT_JSON = `${SOLO_APP_DIR}\\resources\\app\\product.json`;
export const MANIFEST_JSON = `${SOLO_APP_DIR}\\manifest.json`;
export const DESKTOP_CONFIG_JS = `${SOLO_APP_DIR}\\resources\\app\\out\\vs\\code\\electron-browser\\scenes\\desktop.config.js`;
export const CDP_PORT = 9222;
export const GATEWAY_PORT = 18080;
export const BACKUP_DIR = 'backups';
export const SCREENSHOT_DIR = 'screenshots';
export const API_DOCS_DIR = 'api-docs';

// 进程管理相关常量
export const DEFAULT_CDP_PORT = 9222;
export const CDP_HOST = '127.0.0.1';
export const CDP_VERSION_ENDPOINT = '/json/version';
export const STARTUP_TIMEOUT_MS = 60_000;       // 启动超时 60s
export const SHUTDOWN_TIMEOUT_MS = 15_000;       // 停止超时 15s
export const CDP_POLL_INTERVAL_MS = 2_000;       // CDP 轮询间隔
export const CDP_POLL_MAX_RETRIES = 30;          // CDP 最大轮询次数
export const PROCESS_EXIT_POLL_MS = 500;         // 进程退出轮询间隔
export const PROCESS_EXIT_MAX_POLLS = 30;        // 进程退出最大轮询次数 (15s)
export const WATCHER_CHANGE_HISTORY_MAX = 50;    // 变更历史最大记录数
export const WATCHER_HISTORY_FILE = 'watcher-history.json';

export const PRESETS = {
  aggressive: {
    name: 'aggressive',
    description: '激进模式：解锁全部功能',
    changes: {
      'computerUse.enable': true,
      'autoRunConfig.ideCommandMode': 'blacklist',
      'autoRunConfig.soloCommandMode': 'blacklist',
      'icubeConfig.mcpToolLimit': 200,
      'icubeConfig.mcpTokenLimit': 32000,
      'icubeConfig.customPromptTokenLimit': 50000,
      'icubeConfig.featureGates.enableHashDoc': true,
      'icubeConfig.featureGates.enableCueflow': true,
      'icubeConfig.featureGates.enableTabCue': true,
      'icubeConfig.worktree.enable': true,
    }
  },
  conservative: {
    name: 'conservative',
    description: '保守模式：仅放开AI限制',
    changes: {
      'icubeConfig.mcpToolLimit': 100,
      'icubeConfig.mcpTokenLimit': 16000,
      'icubeConfig.customPromptTokenLimit': 20000,
    }
  }
} as const;

export const SOLO_PROCESS_NAMES = [
  'TRAE SOLO CN.exe',
  'ai-agent.exe',
  'ckg_server_windows_x64.exe',
  'trae-sandbox.exe',
  'TRAE SOLO CN',
] as const;
